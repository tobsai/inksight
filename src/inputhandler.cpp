/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * inputhandler.cpp - Keyboard input handling implementation
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

#include "inputhandler.h"
#include <QDebug>
#include <QDir>
#include <QTimer>

#ifdef REMARKABLE_PAPERPRO
#include <fcntl.h>
#include <unistd.h>
#include <linux/input.h>
#include <dirent.h>
#endif

InputHandler::InputHandler(QObject *parent)
    : QObject(parent)
    , m_running(false)
    , m_connected(false)
    , m_currentModifiers(Qt::NoModifier)
#ifdef REMARKABLE_PAPERPRO
    , m_evdev(nullptr)
    , m_fd(-1)
    , m_inputThread(nullptr)
#endif
{
}

InputHandler::~InputHandler()
{
    stop();
}

bool InputHandler::isConnected() const
{
    return m_connected;
}

QString InputHandler::keyboardName() const
{
    return m_keyboardName;
}

void InputHandler::start()
{
#ifdef REMARKABLE_PAPERPRO
    if (m_running) return;

    m_running = true;
    findKeyboardDevice();

    if (m_connected) {
        // Start polling for events
        QTimer *timer = new QTimer(this);
        connect(timer, &QTimer::timeout, this, &InputHandler::processEvents);
        timer->start(10); // 10ms polling interval
    } else {
        // Retry finding keyboard periodically
        QTimer *scanTimer = new QTimer(this);
        connect(scanTimer, &QTimer::timeout, this, &InputHandler::scanForKeyboards);
        scanTimer->start(2000); // Scan every 2 seconds
    }
#else
    qDebug() << "InputHandler: Running in development mode, using Qt keyboard handling";
    m_running = true;
#endif
}

void InputHandler::stop()
{
#ifdef REMARKABLE_PAPERPRO
    m_running = false;

    if (m_evdev) {
        libevdev_free(m_evdev);
        m_evdev = nullptr;
    }

    if (m_fd >= 0) {
        close(m_fd);
        m_fd = -1;
    }
#endif

    m_connected = false;
    emit connectionChanged();
}

void InputHandler::scanForKeyboards()
{
    if (!m_connected) {
        findKeyboardDevice();
    }
}

#ifdef REMARKABLE_PAPERPRO
void InputHandler::findKeyboardDevice()
{
    // Scan /dev/input/ for keyboard devices
    const char *inputDir = "/dev/input";
    DIR *dir = opendir(inputDir);
    if (!dir) {
        emit errorOccurred(tr("Cannot open input device directory"));
        return;
    }

    struct dirent *entry;
    while ((entry = readdir(dir)) != nullptr) {
        if (strncmp(entry->d_name, "event", 5) != 0) continue;

        QString devicePath = QString("%1/%2").arg(inputDir, entry->d_name);
        int fd = open(devicePath.toUtf8().constData(), O_RDONLY | O_NONBLOCK);
        if (fd < 0) continue;

        struct libevdev *evdev = nullptr;
        int rc = libevdev_new_from_fd(fd, &evdev);
        if (rc < 0) {
            close(fd);
            continue;
        }

        // Check if this is a keyboard (has KEY_A capability)
        if (libevdev_has_event_code(evdev, EV_KEY, KEY_A)) {
            m_devicePath = devicePath;
            m_fd = fd;
            m_evdev = evdev;
            m_keyboardName = QString::fromUtf8(libevdev_get_name(evdev));
            m_connected = true;

            qDebug() << "Found keyboard:" << m_keyboardName << "at" << m_devicePath;
            emit keyboardConnected(m_keyboardName);
            emit connectionChanged();

            closedir(dir);
            return;
        }

        libevdev_free(evdev);
        close(fd);
    }

    closedir(dir);
}

void InputHandler::processEvents()
{
    if (!m_evdev || !m_running) return;

    struct input_event ev;
    int rc;

    while ((rc = libevdev_next_event(m_evdev, LIBEVDEV_READ_FLAG_NORMAL, &ev)) == 0) {
        if (ev.type == EV_KEY) {
            handleKeyEvent(ev.code, ev.value);
        }
    }

    // Check for device disconnection
    if (rc == -ENODEV) {
        m_connected = false;
        m_keyboardName.clear();
        libevdev_free(m_evdev);
        m_evdev = nullptr;
        close(m_fd);
        m_fd = -1;

        emit keyboardDisconnected();
        emit connectionChanged();
    }
}

void InputHandler::handleKeyEvent(unsigned int keyCode, int value)
{
    // value: 0 = release, 1 = press, 2 = repeat
    bool pressed = (value > 0);

    // Handle modifiers
    switch (keyCode) {
        case KEY_LEFTCTRL:
        case KEY_RIGHTCTRL:
            if (pressed)
                m_currentModifiers |= Qt::ControlModifier;
            else
                m_currentModifiers &= ~Qt::ControlModifier;
            return;

        case KEY_LEFTSHIFT:
        case KEY_RIGHTSHIFT:
            if (pressed)
                m_currentModifiers |= Qt::ShiftModifier;
            else
                m_currentModifiers &= ~Qt::ShiftModifier;
            return;

        case KEY_LEFTALT:
        case KEY_RIGHTALT:
            if (pressed)
                m_currentModifiers |= Qt::AltModifier;
            else
                m_currentModifiers &= ~Qt::AltModifier;
            return;
    }

    // Only handle key presses (not releases) for most keys
    if (!pressed) return;

    // Check for keyboard shortcuts first
    if (m_currentModifiers & Qt::ControlModifier) {
        switch (keyCode) {
            case KEY_S: emit saveRequested(); return;
            case KEY_O: emit openRequested(); return;
            case KEY_N: emit newRequested(); return;
            case KEY_K: emit quickSwitchRequested(); return;
            case KEY_Z:
                if (m_currentModifiers & Qt::ShiftModifier)
                    emit redoRequested();
                else
                    emit undoRequested();
                return;
            case KEY_Y: emit redoRequested(); return;
            case KEY_EQUAL: // Ctrl++ (= key)
            case KEY_KPPLUS:
                emit fontIncreaseRequested(); return;
            case KEY_MINUS:
            case KEY_KPMINUS:
                emit fontDecreaseRequested(); return;
        }
    }

    // Handle special keys
    switch (keyCode) {
        case KEY_ESC:
            emit escapePressed();
            return;

        case KEY_BACKSPACE:
            emit backspacePressed();
            return;

        case KEY_DELETE:
            emit deletePressed();
            return;

        case KEY_ENTER:
        case KEY_KPENTER:
            emit enterPressed();
            return;

        case KEY_UP:
            emit arrowPressed(0);
            return;

        case KEY_DOWN:
            emit arrowPressed(1);
            return;

        case KEY_LEFT:
            emit arrowPressed(2);
            return;

        case KEY_RIGHT:
            emit arrowPressed(3);
            return;
    }

    // Convert key code to string and emit
    QString keyStr = keyCodeToString(keyCode);
    if (!keyStr.isEmpty()) {
        if (pressed) {
            emit keyPressed(keyStr, m_currentModifiers);
        } else {
            emit keyReleased(keyStr, m_currentModifiers);
        }
    }
}

QString InputHandler::keyCodeToString(unsigned int keyCode) const
{
    // Handle shift modifier for uppercase
    bool shift = (m_currentModifiers & Qt::ShiftModifier);

    // Letter keys
    if (keyCode >= KEY_Q && keyCode <= KEY_P) {
        static const char letters[] = "qwertyuiop";
        char c = letters[keyCode - KEY_Q];
        return QString(shift ? QChar(c).toUpper() : QChar(c));
    }

    if (keyCode >= KEY_A && keyCode <= KEY_L) {
        static const char letters[] = "asdfghjkl";
        char c = letters[keyCode - KEY_A];
        return QString(shift ? QChar(c).toUpper() : QChar(c));
    }

    if (keyCode >= KEY_Z && keyCode <= KEY_M) {
        static const char letters[] = "zxcvbnm";
        char c = letters[keyCode - KEY_Z];
        return QString(shift ? QChar(c).toUpper() : QChar(c));
    }

    // Number keys
    if (keyCode >= KEY_1 && keyCode <= KEY_0) {
        static const char numbers[] = "1234567890";
        static const char shifted[] = "!@#$%^&*()";
        int idx = (keyCode == KEY_0) ? 9 : (keyCode - KEY_1);
        return QString(QChar(shift ? shifted[idx] : numbers[idx]));
    }

    // Other characters
    switch (keyCode) {
        case KEY_SPACE: return " ";
        case KEY_TAB: return "\t";
        case KEY_MINUS: return shift ? "_" : "-";
        case KEY_EQUAL: return shift ? "+" : "=";
        case KEY_LEFTBRACE: return shift ? "{" : "[";
        case KEY_RIGHTBRACE: return shift ? "}" : "]";
        case KEY_SEMICOLON: return shift ? ":" : ";";
        case KEY_APOSTROPHE: return shift ? "\"" : "'";
        case KEY_GRAVE: return shift ? "~" : "`";
        case KEY_BACKSLASH: return shift ? "|" : "\\";
        case KEY_COMMA: return shift ? "<" : ",";
        case KEY_DOT: return shift ? ">" : ".";
        case KEY_SLASH: return shift ? "?" : "/";
    }

    return QString();
}

#else // !REMARKABLE_PAPERPRO

void InputHandler::findKeyboardDevice()
{
    // In development mode, we don't need to find a device
    m_connected = true;
    m_keyboardName = "Development Mode";
    emit keyboardConnected(m_keyboardName);
    emit connectionChanged();
}

void InputHandler::processEvents()
{
    // In development mode, Qt handles keyboard events
}

void InputHandler::handleKeyEvent(unsigned int keyCode, int value)
{
    Q_UNUSED(keyCode);
    Q_UNUSED(value);
}

QString InputHandler::keyCodeToString(unsigned int keyCode) const
{
    Q_UNUSED(keyCode);
    return QString();
}

#endif // REMARKABLE_PAPERPRO

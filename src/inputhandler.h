/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * inputhandler.h - Keyboard input handling via evdev
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

#ifndef INPUTHANDLER_H
#define INPUTHANDLER_H

#include <QObject>
#include <QThread>
#include <QString>

#ifdef REMARKABLE_PAPERPRO
#include <libevdev/libevdev.h>
#endif

/**
 * @brief The InputHandler class manages keyboard input on the reMarkable.
 *
 * On the Paper Pro, this class uses libevdev to directly read keyboard events
 * from USB keyboards connected via USB-C OTG. In development builds, it falls
 * back to Qt's built-in keyboard handling.
 */
class InputHandler : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool connected READ isConnected NOTIFY connectionChanged)
    Q_PROPERTY(QString keyboardName READ keyboardName NOTIFY connectionChanged)

public:
    explicit InputHandler(QObject *parent = nullptr);
    ~InputHandler();

    // Property getters
    bool isConnected() const;
    QString keyboardName() const;

public slots:
    void start();
    void stop();
    void scanForKeyboards();

signals:
    // Key events
    void keyPressed(const QString &key, Qt::KeyboardModifiers modifiers);
    void keyReleased(const QString &key, Qt::KeyboardModifiers modifiers);

    // Special keys
    void escapePressed();
    void backspacePressed();
    void deletePressed();
    void enterPressed();
    void arrowPressed(int direction); // 0=up, 1=down, 2=left, 3=right

    // Modifier combos
    void saveRequested();        // Ctrl+S
    void openRequested();        // Ctrl+O
    void newRequested();         // Ctrl+N
    void quickSwitchRequested(); // Ctrl+K
    void undoRequested();        // Ctrl+Z
    void redoRequested();        // Ctrl+Y / Ctrl+Shift+Z
    void fontIncreaseRequested(); // Ctrl++
    void fontDecreaseRequested(); // Ctrl+-
    void aiTransformRequested(); // Ctrl+T
    void aiSettingsRequested();  // Ctrl+,
    void selectionArrowPressed(int direction); // Shift+Arrow (0=up, 1=down, 2=left, 3=right)

    // Connection status
    void connectionChanged();
    void keyboardConnected(const QString &name);
    void keyboardDisconnected();
    void errorOccurred(const QString &message);

private slots:
    void processEvents();

private:
    void findKeyboardDevice();
    QString keyCodeToString(unsigned int keyCode) const;
    void handleKeyEvent(unsigned int keyCode, int value);

    bool m_running;
    bool m_connected;
    QString m_keyboardName;
    QString m_devicePath;

    Qt::KeyboardModifiers m_currentModifiers;

#ifdef REMARKABLE_PAPERPRO
    struct libevdev *m_evdev;
    int m_fd;
    QThread *m_inputThread;
#endif
};

#endif // INPUTHANDLER_H

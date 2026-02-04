/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * main.cpp - Application entry point
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QDir>

#include "editor.h"
#include "filemanager.h"
#include "inputhandler.h"

int main(int argc, char *argv[])
{
    // Set application attributes
    QCoreApplication::setAttribute(Qt::AA_EnableHighDpiScaling);

    QGuiApplication app(argc, argv);
    app.setApplicationName("Ghostwriter Pro");
    app.setApplicationVersion(APP_VERSION);
    app.setOrganizationName("tobsai");

    // Use Basic style for minimal overhead on e-ink
    QQuickStyle::setStyle("Basic");

    // Create application components
    Editor editor;
    FileManager fileManager;
    InputHandler inputHandler;

    // Set up default document directory
#ifdef REMARKABLE_PAPERPRO
    QString documentDir = QDir::homePath() + "/ghostwriter";
#else
    QString documentDir = QDir::homePath() + "/.ghostwriter";
#endif

    QDir dir(documentDir);
    if (!dir.exists()) {
        dir.mkpath(".");
    }
    fileManager.setDocumentDirectory(documentDir);

    // Set up QML engine
    QQmlApplicationEngine engine;

    // Expose C++ objects to QML
    engine.rootContext()->setContextProperty("editor", &editor);
    engine.rootContext()->setContextProperty("fileManager", &fileManager);
    engine.rootContext()->setContextProperty("inputHandler", &inputHandler);
    engine.rootContext()->setContextProperty("documentDir", documentDir);

    // Load main QML file
    const QUrl url(QStringLiteral("qrc:/qml/main.qml"));
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreated,
                     &app, [url](QObject *obj, const QUrl &objUrl) {
        if (!obj && url == objUrl)
            QCoreApplication::exit(-1);
    }, Qt::QueuedConnection);

    engine.load(url);

    // Start keyboard input handler
#ifdef REMARKABLE_PAPERPRO
    inputHandler.start();
#endif

    return app.exec();
}

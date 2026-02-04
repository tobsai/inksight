/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * main.qml - Main application window
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Window 2.15

ApplicationWindow {
    id: window
    visible: true
    visibility: Window.FullScreen
    title: qsTr("Ghostwriter Pro")

    // Use monochrome colors for e-ink
    color: "#ffffff"

    // Current mode: "edit" or "preview"
    property string mode: "edit"

    // Quick switcher state
    property bool quickSwitcherVisible: false

    // File picker state
    property bool filePickerVisible: false

    // Connect to input handler signals
    Connections {
        target: inputHandler

        function onKeyPressed(key, modifiers) {
            if (mode === "edit") {
                editorComponent.insertText(key)
            }
        }

        function onBackspacePressed() {
            if (mode === "edit") {
                editor.backspace()
            }
        }

        function onDeletePressed() {
            if (mode === "edit") {
                editor.deleteChar()
            }
        }

        function onEnterPressed() {
            if (quickSwitcherVisible) {
                quickSwitcher.accept()
            } else if (mode === "edit") {
                editor.newLine()
            }
        }

        function onEscapePressed() {
            if (quickSwitcherVisible) {
                quickSwitcherVisible = false
            } else if (filePickerVisible) {
                filePickerVisible = false
            } else {
                // Toggle between edit and preview mode
                mode = (mode === "edit") ? "preview" : "edit"
            }
        }

        function onArrowPressed(direction) {
            if (mode === "edit") {
                switch (direction) {
                    case 0: editor.moveCursorUp(); break
                    case 1: editor.moveCursorDown(); break
                    case 2: editor.moveCursorLeft(); break
                    case 3: editor.moveCursorRight(); break
                }
            }
        }

        function onSaveRequested() {
            if (editor.currentFile) {
                editor.saveDocument()
            } else {
                // TODO: Show save dialog
                quickSwitcherVisible = true
            }
        }

        function onOpenRequested() {
            filePickerVisible = true
        }

        function onNewRequested() {
            editor.newDocument()
        }

        function onQuickSwitchRequested() {
            quickSwitcherVisible = true
        }

        function onUndoRequested() {
            editor.undo()
        }

        function onRedoRequested() {
            editor.redo()
        }

        function onFontIncreaseRequested() {
            editor.increaseFontSize()
        }

        function onFontDecreaseRequested() {
            editor.decreaseFontSize()
        }
    }

    // Main editor view
    Editor {
        id: editorComponent
        anchors.fill: parent
        visible: !filePickerVisible && !quickSwitcherVisible
        editMode: mode === "edit"
    }

    // File picker overlay
    FilePicker {
        id: filePicker
        anchors.fill: parent
        visible: filePickerVisible

        onFileSelected: function(filePath) {
            editor.loadDocument(filePath)
            filePickerVisible = false
        }

        onCancelled: {
            filePickerVisible = false
        }
    }

    // Quick switcher overlay
    QuickSwitcher {
        id: quickSwitcher
        anchors.centerIn: parent
        visible: quickSwitcherVisible

        onDocumentSelected: function(name) {
            var path = fileManager.fullPath(name)
            if (fileManager.documentExists(name)) {
                editor.loadDocument(path)
            } else {
                path = fileManager.createDocument(name)
                if (path) {
                    editor.loadDocument(path)
                }
            }
            quickSwitcherVisible = false
        }

        onCancelled: {
            quickSwitcherVisible = false
        }
    }

    // Status bar at bottom
    Rectangle {
        id: statusBar
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: 40
        color: "#f0f0f0"
        visible: !filePickerVisible && !quickSwitcherVisible

        Row {
            anchors.left: parent.left
            anchors.leftMargin: 20
            anchors.verticalCenter: parent.verticalCenter
            spacing: 20

            Text {
                text: editor.currentFile ? fileManager.baseName(editor.currentFile) : "Untitled"
                font.pixelSize: 14
                color: "#333333"
            }

            Text {
                text: editor.modified ? "●" : ""
                font.pixelSize: 14
                color: "#666666"
            }
        }

        Row {
            anchors.right: parent.right
            anchors.rightMargin: 20
            anchors.verticalCenter: parent.verticalCenter
            spacing: 20

            Text {
                text: mode === "edit" ? "EDIT" : "VIEW"
                font.pixelSize: 12
                color: "#666666"
            }

            Text {
                text: inputHandler.connected ? "⌨" : "⌨?"
                font.pixelSize: 16
                color: inputHandler.connected ? "#333333" : "#999999"
            }
        }
    }

    // Notification area
    Rectangle {
        id: notification
        anchors.top: parent.top
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.topMargin: 20
        width: notificationText.width + 40
        height: 40
        radius: 5
        color: "#333333"
        opacity: 0
        visible: opacity > 0

        Text {
            id: notificationText
            anchors.centerIn: parent
            color: "#ffffff"
            font.pixelSize: 14
        }

        Behavior on opacity {
            NumberAnimation { duration: 200 }
        }

        function show(message) {
            notificationText.text = message
            opacity = 1
            notificationTimer.restart()
        }

        Timer {
            id: notificationTimer
            interval: 2000
            onTriggered: notification.opacity = 0
        }
    }

    // Connect to editor signals for notifications
    Connections {
        target: editor

        function onDocumentSaved() {
            notification.show("Saved")
        }

        function onDocumentLoaded(fileName) {
            notification.show("Opened: " + fileName)
        }

        function onErrorOccurred(message) {
            notification.show("Error: " + message)
        }
    }

    // Development mode keyboard handling
    // (When not using evdev input handler)
    Keys.onPressed: function(event) {
        if (!inputHandler.connected || typeof DEVELOPMENT_BUILD !== 'undefined') {
            // Handle in QML for development
            if (event.modifiers & Qt.ControlModifier) {
                switch (event.key) {
                    case Qt.Key_S: inputHandler.saveRequested(); event.accepted = true; break
                    case Qt.Key_O: inputHandler.openRequested(); event.accepted = true; break
                    case Qt.Key_N: inputHandler.newRequested(); event.accepted = true; break
                    case Qt.Key_K: inputHandler.quickSwitchRequested(); event.accepted = true; break
                    case Qt.Key_Z: inputHandler.undoRequested(); event.accepted = true; break
                    case Qt.Key_Y: inputHandler.redoRequested(); event.accepted = true; break
                }
            } else {
                switch (event.key) {
                    case Qt.Key_Escape: inputHandler.escapePressed(); event.accepted = true; break
                    case Qt.Key_Backspace: inputHandler.backspacePressed(); event.accepted = true; break
                    case Qt.Key_Delete: inputHandler.deletePressed(); event.accepted = true; break
                    case Qt.Key_Return:
                    case Qt.Key_Enter: inputHandler.enterPressed(); event.accepted = true; break
                    case Qt.Key_Up: inputHandler.arrowPressed(0); event.accepted = true; break
                    case Qt.Key_Down: inputHandler.arrowPressed(1); event.accepted = true; break
                    case Qt.Key_Left: inputHandler.arrowPressed(2); event.accepted = true; break
                    case Qt.Key_Right: inputHandler.arrowPressed(3); event.accepted = true; break
                    default:
                        if (event.text && mode === "edit") {
                            editorComponent.insertText(event.text)
                            event.accepted = true
                        }
                }
            }
        }
    }

    Component.onCompleted: {
        // Load last document or create new
        fileManager.refreshDocuments()
    }
}

/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * Editor.qml - Main text editor component
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

import QtQuick 2.15
import QtQuick.Controls 2.15

Item {
    id: root

    // Mode property
    property bool editMode: true

    // Insert text at cursor (called from main.qml)
    function insertText(text) {
        editor.insertText(text)
    }

    // Scrollable text area
    Flickable {
        id: flickable
        anchors.fill: parent
        anchors.margins: 40
        anchors.bottomMargin: 60 // Room for status bar

        contentWidth: width
        contentHeight: Math.max(textDisplay.height + 100, height)
        clip: true

        // Edit mode: show text with cursor
        Text {
            id: textDisplay
            width: parent.width
            wrapMode: Text.WordWrap
            font.family: "monospace"
            font.pixelSize: editor.fontSize
            color: "#000000"
            lineHeight: 1.5

            // Display content with cursor in edit mode
            text: {
                if (editMode) {
                    var content = editor.content
                    var pos = editor.cursorPosition
                    var before = content.substring(0, pos)
                    var after = content.substring(pos)
                    return before + "│" + after
                } else {
                    return editor.content
                }
            }
        }

        ScrollBar.vertical: ScrollBar {
            policy: ScrollBar.AsNeeded
        }
    }

    // Preview mode overlay indicator
    Rectangle {
        anchors.top: parent.top
        anchors.right: parent.right
        anchors.margins: 20
        width: 80
        height: 30
        radius: 3
        color: "#e0e0e0"
        visible: !editMode

        Text {
            anchors.centerIn: parent
            text: "Preview"
            font.pixelSize: 12
            color: "#666666"
        }
    }

    // Empty state
    Text {
        anchors.centerIn: parent
        text: "Start typing..."
        font.pixelSize: 24
        color: "#cccccc"
        visible: editor.content.length === 0 && editMode
    }

    // Cursor blink animation
    Timer {
        id: cursorBlink
        interval: 500
        running: editMode && root.visible
        repeat: true
        onTriggered: {
            // Toggle cursor visibility by updating text
            textDisplay.opacity = textDisplay.opacity === 1 ? 0.99 : 1
        }
    }
}

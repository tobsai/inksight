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

        // Edit mode: show text with cursor and selection
        TextEdit {
            id: textDisplay
            width: parent.width
            wrapMode: Text.WordWrap
            font.family: "monospace"
            font.pixelSize: editor.fontSize
            color: "#000000"
            lineHeight: 1.5
            readOnly: true  // We handle editing via our own input system
            selectionColor: "#c0c0c0"  // Light gray for e-ink visibility
            selectedTextColor: "#000000"
            textFormat: TextEdit.PlainText

            // Sync with editor content
            text: editor.content

            // Sync cursor position
            cursorPosition: editor.cursorPosition

            // Sync selection
            Component.onCompleted: updateSelection()

            function updateSelection() {
                if (editor.hasSelection) {
                    select(editor.selectionStart, editor.selectionEnd)
                } else {
                    deselect()
                }
            }

            Connections {
                target: editor
                function onSelectionChanged() {
                    textDisplay.updateSelection()
                }
                function onCursorPositionChanged() {
                    textDisplay.cursorPosition = editor.cursorPosition
                }
                function onContentChanged() {
                    textDisplay.text = editor.content
                }
            }

            // Show cursor in edit mode
            cursorVisible: editMode
        }

        // Cursor overlay for better visibility
        Rectangle {
            id: cursorOverlay
            width: 2
            height: editor.fontSize * 1.2
            color: "#000000"
            visible: editMode && !editor.hasSelection
            opacity: cursorBlink.running ? (cursorBlinkState ? 1 : 0) : 1

            property bool cursorBlinkState: true

            Timer {
                id: cursorBlink
                interval: 500
                running: editMode && root.visible && !editor.hasSelection
                repeat: true
                onTriggered: cursorOverlay.cursorBlinkState = !cursorOverlay.cursorBlinkState
            }

            // Position the cursor overlay
            // This is approximate - for production you'd calculate from text metrics
            x: {
                // Simple estimate based on character position
                var lineStart = editor.content.lastIndexOf('\n', editor.cursorPosition - 1) + 1
                var col = editor.cursorPosition - lineStart
                return col * editor.fontSize * 0.6  // Approximate character width
            }
            y: {
                // Count newlines before cursor
                var text = editor.content.substring(0, editor.cursorPosition)
                var lines = text.split('\n').length - 1
                return lines * editor.fontSize * 1.5
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

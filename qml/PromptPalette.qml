/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * PromptPalette.qml - AI prompt selection palette
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

import QtQuick 2.15
import QtQuick.Controls 2.15

Rectangle {
    id: root
    width: 500
    height: Math.min(600, contentColumn.height + 40)
    radius: 8
    color: "#ffffff"
    border.color: "#333333"
    border.width: 2

    property string selectedText: ""
    property var templates: []

    signal promptSelected(string templateId, string customPrompt)
    signal cancelled()

    // Shadow effect
    Rectangle {
        anchors.fill: parent
        anchors.margins: -4
        z: -1
        radius: 12
        color: "#00000033"
    }

    Column {
        id: contentColumn
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: 20
        spacing: 16

        // Header
        Row {
            width: parent.width
            spacing: 10

            Text {
                text: "✨"
                font.pixelSize: 24
            }

            Column {
                spacing: 4

                Text {
                    text: "AI Transform"
                    font.pixelSize: 18
                    font.bold: true
                    color: "#333333"
                }

                Text {
                    text: root.selectedText.length + " characters selected"
                    font.pixelSize: 12
                    color: "#666666"
                }
            }
        }

        // Divider
        Rectangle {
            width: parent.width
            height: 1
            color: "#e0e0e0"
        }

        // Selected text preview
        Rectangle {
            width: parent.width
            height: previewText.height + 16
            radius: 4
            color: "#f5f5f5"
            visible: root.selectedText.length > 0

            Text {
                id: previewText
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.margins: 8
                text: root.selectedText.length > 100 
                    ? root.selectedText.substring(0, 100) + "..."
                    : root.selectedText
                font.pixelSize: 12
                color: "#666666"
                wrapMode: Text.WordWrap
                font.italic: true
            }
        }

        // Prompt templates grid
        Text {
            text: "Select a transformation:"
            font.pixelSize: 14
            font.bold: true
            color: "#333333"
        }

        Grid {
            id: promptGrid
            width: parent.width
            columns: 2
            spacing: 8

            Repeater {
                model: root.templates.filter(t => t.id !== "custom")

                Rectangle {
                    width: (promptGrid.width - 8) / 2
                    height: 60
                    radius: 4
                    color: promptArea.pressed ? "#e0e0e0" : (promptArea.containsMouse ? "#f5f5f5" : "#fafafa")
                    border.color: "#e0e0e0"

                    Row {
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        anchors.margins: 12
                        spacing: 8

                        Text {
                            text: modelData.icon
                            font.pixelSize: 20
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        Column {
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: 2
                            width: parent.width - 36

                            Text {
                                text: modelData.name
                                font.pixelSize: 14
                                font.bold: true
                                color: "#333333"
                            }

                            Text {
                                text: modelData.description
                                font.pixelSize: 10
                                color: "#666666"
                                elide: Text.ElideRight
                                width: parent.width
                            }
                        }
                    }

                    MouseArea {
                        id: promptArea
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: root.promptSelected(modelData.id, "")
                    }
                }
            }
        }

        // Custom prompt input
        Rectangle {
            width: parent.width
            height: 1
            color: "#e0e0e0"
        }

        Column {
            width: parent.width
            spacing: 8

            Text {
                text: "💬 Or enter a custom prompt:"
                font.pixelSize: 14
                color: "#333333"
            }

            Rectangle {
                width: parent.width
                height: 80
                radius: 4
                color: "#f5f5f5"
                border.color: customInput.activeFocus ? "#333333" : "#e0e0e0"

                TextArea {
                    id: customInput
                    anchors.fill: parent
                    anchors.margins: 8
                    font.pixelSize: 14
                    color: "#333333"
                    wrapMode: Text.WordWrap
                    placeholderText: "e.g., 'Translate to Spanish' or 'Make this more concise'"

                    Keys.onReturnPressed: {
                        if (event.modifiers & Qt.ControlModifier) {
                            if (customInput.text.trim().length > 0) {
                                root.promptSelected("custom", customInput.text.trim())
                            }
                        }
                    }
                }
            }

            Row {
                anchors.right: parent.right
                spacing: 8

                Rectangle {
                    width: 80
                    height: 36
                    radius: 4
                    color: cancelArea.pressed ? "#dddddd" : "#f0f0f0"

                    Text {
                        anchors.centerIn: parent
                        text: "Cancel"
                        font.pixelSize: 14
                        color: "#666666"
                    }

                    MouseArea {
                        id: cancelArea
                        anchors.fill: parent
                        onClicked: root.cancelled()
                    }
                }

                Rectangle {
                    width: 100
                    height: 36
                    radius: 4
                    color: customInput.text.trim().length > 0 
                        ? (applyArea.pressed ? "#222222" : "#333333")
                        : "#cccccc"

                    Text {
                        anchors.centerIn: parent
                        text: "Apply"
                        font.pixelSize: 14
                        font.bold: true
                        color: "#ffffff"
                    }

                    MouseArea {
                        id: applyArea
                        anchors.fill: parent
                        enabled: customInput.text.trim().length > 0
                        onClicked: root.promptSelected("custom", customInput.text.trim())
                    }
                }
            }
        }
    }

    // Keyboard shortcuts
    Keys.onEscapePressed: root.cancelled()

    Component.onCompleted: {
        forceActiveFocus()
    }
}

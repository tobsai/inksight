/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * AISettings.qml - AI provider configuration panel
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

import QtQuick 2.15
import QtQuick.Controls 2.15

Rectangle {
    id: root
    color: "#ffffff"

    signal closed()
    signal testConnection()

    // Header
    Rectangle {
        id: header
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        height: 60
        color: "#f0f0f0"

        Row {
            anchors.left: parent.left
            anchors.leftMargin: 20
            anchors.verticalCenter: parent.verticalCenter
            spacing: 10

            Text {
                text: "🤖"
                font.pixelSize: 24
            }

            Text {
                text: "AI Settings"
                font.pixelSize: 20
                font.bold: true
                color: "#333333"
            }
        }

        // Close button
        Rectangle {
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            anchors.rightMargin: 20
            width: 40
            height: 40
            radius: 20
            color: closeArea.pressed ? "#dddddd" : "transparent"

            Text {
                anchors.centerIn: parent
                text: "✕"
                font.pixelSize: 20
                color: "#666666"
            }

            MouseArea {
                id: closeArea
                anchors.fill: parent
                onClicked: root.closed()
            }
        }
    }

    // Content
    Flickable {
        anchors.top: header.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        contentHeight: contentColumn.height + 40
        clip: true

        Column {
            id: contentColumn
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.margins: 20
            anchors.topMargin: 20
            spacing: 24

            // Provider selection
            Column {
                width: parent.width
                spacing: 12

                Text {
                    text: "AI Provider"
                    font.pixelSize: 16
                    font.bold: true
                    color: "#333333"
                }

                Text {
                    text: "Select which AI service to use for text transformations"
                    font.pixelSize: 12
                    color: "#666666"
                }

                Column {
                    width: parent.width
                    spacing: 8

                    // OpenAI option
                    Rectangle {
                        width: parent.width
                        height: 60
                        radius: 4
                        color: aiConfig.currentProvider === "openai" ? "#f0f0f0" : "transparent"
                        border.color: aiConfig.currentProvider === "openai" ? "#333333" : "#e0e0e0"
                        border.width: aiConfig.currentProvider === "openai" ? 2 : 1

                        Row {
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.verticalCenter: parent.verticalCenter
                            anchors.margins: 12
                            spacing: 12

                            Rectangle {
                                width: 20
                                height: 20
                                radius: 10
                                border.color: "#333333"
                                border.width: 2
                                color: aiConfig.currentProvider === "openai" ? "#333333" : "transparent"
                            }

                            Column {
                                spacing: 2

                                Text {
                                    text: "OpenAI"
                                    font.pixelSize: 14
                                    font.bold: true
                                    color: "#333333"
                                }

                                Text {
                                    text: "GPT-4, GPT-4o, etc."
                                    font.pixelSize: 11
                                    color: "#666666"
                                }
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            onClicked: aiConfig.currentProvider = "openai"
                        }
                    }

                    // Anthropic option
                    Rectangle {
                        width: parent.width
                        height: 60
                        radius: 4
                        color: aiConfig.currentProvider === "anthropic" ? "#f0f0f0" : "transparent"
                        border.color: aiConfig.currentProvider === "anthropic" ? "#333333" : "#e0e0e0"
                        border.width: aiConfig.currentProvider === "anthropic" ? 2 : 1

                        Row {
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.verticalCenter: parent.verticalCenter
                            anchors.margins: 12
                            spacing: 12

                            Rectangle {
                                width: 20
                                height: 20
                                radius: 10
                                border.color: "#333333"
                                border.width: 2
                                color: aiConfig.currentProvider === "anthropic" ? "#333333" : "transparent"
                            }

                            Column {
                                spacing: 2

                                Text {
                                    text: "Anthropic"
                                    font.pixelSize: 14
                                    font.bold: true
                                    color: "#333333"
                                }

                                Text {
                                    text: "Claude Sonnet, Opus, etc."
                                    font.pixelSize: 11
                                    color: "#666666"
                                }
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            onClicked: aiConfig.currentProvider = "anthropic"
                        }
                    }

                    // Ollama option
                    Rectangle {
                        width: parent.width
                        height: 60
                        radius: 4
                        color: aiConfig.currentProvider === "ollama" ? "#f0f0f0" : "transparent"
                        border.color: aiConfig.currentProvider === "ollama" ? "#333333" : "#e0e0e0"
                        border.width: aiConfig.currentProvider === "ollama" ? 2 : 1

                        Row {
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.verticalCenter: parent.verticalCenter
                            anchors.margins: 12
                            spacing: 12

                            Rectangle {
                                width: 20
                                height: 20
                                radius: 10
                                border.color: "#333333"
                                border.width: 2
                                color: aiConfig.currentProvider === "ollama" ? "#333333" : "transparent"
                            }

                            Column {
                                spacing: 2

                                Text {
                                    text: "Ollama (Local)"
                                    font.pixelSize: 14
                                    font.bold: true
                                    color: "#333333"
                                }

                                Text {
                                    text: "Self-hosted, no API key needed"
                                    font.pixelSize: 11
                                    color: "#666666"
                                }
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            onClicked: aiConfig.currentProvider = "ollama"
                        }
                    }
                }
            }

            // Divider
            Rectangle {
                width: parent.width
                height: 1
                color: "#e0e0e0"
            }

            // OpenAI settings
            Column {
                width: parent.width
                spacing: 12
                visible: aiConfig.currentProvider === "openai"

                Text {
                    text: "OpenAI Configuration"
                    font.pixelSize: 16
                    font.bold: true
                    color: "#333333"
                }

                Column {
                    width: parent.width
                    spacing: 4

                    Text {
                        text: "API Key"
                        font.pixelSize: 12
                        color: "#666666"
                    }

                    Rectangle {
                        width: parent.width
                        height: 44
                        radius: 4
                        color: "#f5f5f5"
                        border.color: openaiKeyInput.activeFocus ? "#333333" : "#e0e0e0"

                        TextInput {
                            id: openaiKeyInput
                            anchors.fill: parent
                            anchors.margins: 12
                            font.pixelSize: 14
                            color: "#333333"
                            echoMode: TextInput.Password
                            clip: true

                            onTextChanged: aiConfig.setOpenAIKey(text)

                            Text {
                                anchors.fill: parent
                                text: "sk-..."
                                font.pixelSize: 14
                                color: "#999999"
                                visible: !openaiKeyInput.text && !openaiKeyInput.activeFocus
                            }
                        }
                    }
                }

                Column {
                    width: parent.width
                    spacing: 4

                    Text {
                        text: "Model"
                        font.pixelSize: 12
                        color: "#666666"
                    }

                    Rectangle {
                        width: parent.width
                        height: 44
                        radius: 4
                        color: "#f5f5f5"
                        border.color: "#e0e0e0"

                        TextInput {
                            id: openaiModelInput
                            anchors.fill: parent
                            anchors.margins: 12
                            font.pixelSize: 14
                            color: "#333333"
                            text: aiConfig.openaiModel
                            clip: true

                            onTextChanged: aiConfig.openaiModel = text
                        }
                    }
                }
            }

            // Anthropic settings
            Column {
                width: parent.width
                spacing: 12
                visible: aiConfig.currentProvider === "anthropic"

                Text {
                    text: "Anthropic Configuration"
                    font.pixelSize: 16
                    font.bold: true
                    color: "#333333"
                }

                Column {
                    width: parent.width
                    spacing: 4

                    Text {
                        text: "API Key"
                        font.pixelSize: 12
                        color: "#666666"
                    }

                    Rectangle {
                        width: parent.width
                        height: 44
                        radius: 4
                        color: "#f5f5f5"
                        border.color: anthropicKeyInput.activeFocus ? "#333333" : "#e0e0e0"

                        TextInput {
                            id: anthropicKeyInput
                            anchors.fill: parent
                            anchors.margins: 12
                            font.pixelSize: 14
                            color: "#333333"
                            echoMode: TextInput.Password
                            clip: true

                            onTextChanged: aiConfig.setAnthropicKey(text)

                            Text {
                                anchors.fill: parent
                                text: "sk-ant-..."
                                font.pixelSize: 14
                                color: "#999999"
                                visible: !anthropicKeyInput.text && !anthropicKeyInput.activeFocus
                            }
                        }
                    }
                }

                Column {
                    width: parent.width
                    spacing: 4

                    Text {
                        text: "Model"
                        font.pixelSize: 12
                        color: "#666666"
                    }

                    Rectangle {
                        width: parent.width
                        height: 44
                        radius: 4
                        color: "#f5f5f5"
                        border.color: "#e0e0e0"

                        TextInput {
                            id: anthropicModelInput
                            anchors.fill: parent
                            anchors.margins: 12
                            font.pixelSize: 14
                            color: "#333333"
                            text: aiConfig.anthropicModel
                            clip: true

                            onTextChanged: aiConfig.anthropicModel = text
                        }
                    }
                }
            }

            // Ollama settings
            Column {
                width: parent.width
                spacing: 12
                visible: aiConfig.currentProvider === "ollama"

                Text {
                    text: "Ollama Configuration"
                    font.pixelSize: 16
                    font.bold: true
                    color: "#333333"
                }

                Column {
                    width: parent.width
                    spacing: 4

                    Text {
                        text: "Server URL"
                        font.pixelSize: 12
                        color: "#666666"
                    }

                    Rectangle {
                        width: parent.width
                        height: 44
                        radius: 4
                        color: "#f5f5f5"
                        border.color: ollamaUrlInput.activeFocus ? "#333333" : "#e0e0e0"

                        TextInput {
                            id: ollamaUrlInput
                            anchors.fill: parent
                            anchors.margins: 12
                            font.pixelSize: 14
                            color: "#333333"
                            text: aiConfig.ollamaUrl
                            clip: true

                            onTextChanged: aiConfig.ollamaUrl = text
                        }
                    }
                }

                Column {
                    width: parent.width
                    spacing: 4

                    Text {
                        text: "Model"
                        font.pixelSize: 12
                        color: "#666666"
                    }

                    Rectangle {
                        width: parent.width
                        height: 44
                        radius: 4
                        color: "#f5f5f5"
                        border.color: "#e0e0e0"

                        TextInput {
                            id: ollamaModelInput
                            anchors.fill: parent
                            anchors.margins: 12
                            font.pixelSize: 14
                            color: "#333333"
                            text: aiConfig.ollamaModel
                            clip: true

                            onTextChanged: aiConfig.ollamaModel = text
                        }
                    }
                }

                Text {
                    text: "💡 Tip: Run Ollama on a server accessible to your reMarkable via WiFi"
                    font.pixelSize: 11
                    color: "#888888"
                    wrapMode: Text.WordWrap
                    width: parent.width
                }
            }

            // Divider
            Rectangle {
                width: parent.width
                height: 1
                color: "#e0e0e0"
            }

            // Status
            Row {
                width: parent.width
                spacing: 8

                Text {
                    text: aiConfig.isConfigured ? "✅" : "⚠️"
                    font.pixelSize: 16
                }

                Text {
                    text: aiConfig.isConfigured 
                        ? "AI is configured and ready"
                        : "Please configure your API key"
                    font.pixelSize: 14
                    color: aiConfig.isConfigured ? "#4CAF50" : "#FF9800"
                }
            }
        }
    }
}

/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * AIResultView.qml - View for AI transformation results
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

import QtQuick 2.15
import QtQuick.Controls 2.15

Rectangle {
    id: root
    color: "#ffffff"

    property string resultText: ""
    property bool isMermaid: false
    property string mermaidImagePath: ""

    signal replaceClicked()
    signal insertAfterClicked()
    signal discardClicked()
    signal editClicked()

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
            spacing: 12

            Text {
                text: root.isMermaid ? "📊" : "✨"
                font.pixelSize: 24
            }

            Column {
                spacing: 2

                Text {
                    text: root.isMermaid ? "Generated Diagram" : "AI Result"
                    font.pixelSize: 18
                    font.bold: true
                    color: "#333333"
                }

                Text {
                    text: root.isMermaid 
                        ? "Mermaid diagram rendered" 
                        : root.resultText.length + " characters"
                    font.pixelSize: 12
                    color: "#666666"
                }
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
                onClicked: root.discardClicked()
            }
        }
    }

    // Result content
    Flickable {
        id: resultFlickable
        anchors.top: header.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: actionBar.top
        anchors.margins: 20
        contentHeight: contentColumn.height
        clip: true

        Column {
            id: contentColumn
            width: parent.width
            spacing: 16

            // Mermaid image display
            Image {
                id: diagramImage
                visible: root.isMermaid && root.mermaidImagePath.length > 0
                source: root.mermaidImagePath ? "file://" + root.mermaidImagePath : ""
                width: parent.width
                fillMode: Image.PreserveAspectFit
                cache: false

                // Loading indicator
                Rectangle {
                    anchors.centerIn: parent
                    width: 100
                    height: 100
                    radius: 8
                    color: "#f5f5f5"
                    visible: diagramImage.status === Image.Loading

                    Text {
                        anchors.centerIn: parent
                        text: "Loading..."
                        font.pixelSize: 14
                        color: "#666666"
                    }
                }
            }

            // Mermaid code toggle
            Rectangle {
                visible: root.isMermaid
                width: parent.width
                height: showCodeArea.containsMouse ? 36 : 32
                radius: 4
                color: showCodeArea.containsMouse ? "#f5f5f5" : "transparent"

                Row {
                    anchors.left: parent.left
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 8

                    Text {
                        text: mermaidCodeSection.visible ? "▼" : "▶"
                        font.pixelSize: 12
                        color: "#666666"
                    }

                    Text {
                        text: "Show Mermaid code"
                        font.pixelSize: 12
                        color: "#666666"
                    }
                }

                MouseArea {
                    id: showCodeArea
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: mermaidCodeSection.visible = !mermaidCodeSection.visible
                }
            }

            // Mermaid code display
            Rectangle {
                id: mermaidCodeSection
                visible: false
                width: parent.width
                height: mermaidCodeText.height + 20
                radius: 4
                color: "#f5f5f5"

                Text {
                    id: mermaidCodeText
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.top: parent.top
                    anchors.margins: 10
                    text: root.isMermaid ? root.resultText : ""
                    font.family: "monospace"
                    font.pixelSize: 12
                    color: "#333333"
                    wrapMode: Text.WrapAnywhere
                }
            }

            // Text result display
            Text {
                visible: !root.isMermaid
                width: parent.width
                text: root.resultText
                font.pixelSize: 14
                color: "#333333"
                wrapMode: Text.WordWrap
                lineHeight: 1.4
            }
        }

        ScrollBar.vertical: ScrollBar {
            policy: ScrollBar.AsNeeded
        }
    }

    // Action bar
    Rectangle {
        id: actionBar
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: 70
        color: "#f8f8f8"

        Row {
            anchors.centerIn: parent
            spacing: 12

            // Discard button
            Rectangle {
                width: 100
                height: 44
                radius: 4
                color: discardArea.pressed ? "#e0e0e0" : "#f0f0f0"
                border.color: "#ddd"

                Text {
                    anchors.centerIn: parent
                    text: "Discard"
                    font.pixelSize: 14
                    color: "#666666"
                }

                MouseArea {
                    id: discardArea
                    anchors.fill: parent
                    onClicked: root.discardClicked()
                }
            }

            // Insert after button
            Rectangle {
                width: 120
                height: 44
                radius: 4
                color: insertArea.pressed ? "#444444" : "#555555"

                Text {
                    anchors.centerIn: parent
                    text: "Insert After"
                    font.pixelSize: 14
                    font.bold: true
                    color: "#ffffff"
                }

                MouseArea {
                    id: insertArea
                    anchors.fill: parent
                    onClicked: root.insertAfterClicked()
                }
            }

            // Replace button
            Rectangle {
                width: 120
                height: 44
                radius: 4
                color: replaceArea.pressed ? "#222222" : "#333333"

                Text {
                    anchors.centerIn: parent
                    text: "Replace"
                    font.pixelSize: 14
                    font.bold: true
                    color: "#ffffff"
                }

                MouseArea {
                    id: replaceArea
                    anchors.fill: parent
                    onClicked: root.replaceClicked()
                }
            }
        }
    }
}

/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * Settings.qml - Settings panel (placeholder for future use)
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

    // Header
    Rectangle {
        id: header
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        height: 60
        color: "#f0f0f0"

        Text {
            anchors.centerIn: parent
            text: "Settings"
            font.pixelSize: 20
            font.bold: true
            color: "#333333"
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

    // Settings content
    Column {
        anchors.top: header.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.margins: 20
        spacing: 20

        // Font size setting
        Column {
            width: parent.width
            spacing: 8

            Text {
                text: "Font Size"
                font.pixelSize: 16
                font.bold: true
                color: "#333333"
            }

            Row {
                spacing: 20

                Rectangle {
                    width: 44
                    height: 44
                    radius: 4
                    color: decreaseArea.pressed ? "#e0e0e0" : "#f5f5f5"

                    Text {
                        anchors.centerIn: parent
                        text: "−"
                        font.pixelSize: 24
                        color: "#333333"
                    }

                    MouseArea {
                        id: decreaseArea
                        anchors.fill: parent
                        onClicked: editor.decreaseFontSize()
                    }
                }

                Text {
                    text: editor.fontSize + " px"
                    font.pixelSize: 16
                    color: "#666666"
                    anchors.verticalCenter: parent.verticalCenter
                }

                Rectangle {
                    width: 44
                    height: 44
                    radius: 4
                    color: increaseArea.pressed ? "#e0e0e0" : "#f5f5f5"

                    Text {
                        anchors.centerIn: parent
                        text: "+"
                        font.pixelSize: 24
                        color: "#333333"
                    }

                    MouseArea {
                        id: increaseArea
                        anchors.fill: parent
                        onClicked: editor.increaseFontSize()
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

        // About section
        Column {
            width: parent.width
            spacing: 8

            Text {
                text: "About"
                font.pixelSize: 16
                font.bold: true
                color: "#333333"
            }

            Text {
                text: "Ghostwriter Pro v" + APP_VERSION
                font.pixelSize: 14
                color: "#666666"
            }

            Text {
                text: "A distraction-free typewriter for reMarkable Paper Pro"
                font.pixelSize: 14
                color: "#999999"
                wrapMode: Text.WordWrap
                width: parent.width
            }
        }
    }
}

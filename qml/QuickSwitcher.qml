/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * QuickSwitcher.qml - Ctrl+K quick document switcher
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

import QtQuick 2.15
import QtQuick.Controls 2.15

Rectangle {
    id: root
    width: 400
    height: 300
    radius: 8
    color: "#ffffff"
    border.color: "#333333"
    border.width: 2

    signal documentSelected(string name)
    signal cancelled()

    property string searchQuery: ""
    property var filteredDocuments: fileManager.searchDocuments(searchQuery)

    function accept() {
        if (searchQuery.length > 0) {
            documentSelected(searchQuery)
        } else if (filteredDocuments.length > 0) {
            documentSelected(filteredDocuments[0])
        }
    }

    // Shadow effect
    Rectangle {
        anchors.fill: parent
        anchors.margins: -4
        z: -1
        radius: 12
        color: "#00000033"
    }

    Column {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 12

        // Search input
        Rectangle {
            width: parent.width
            height: 44
            radius: 4
            color: "#f5f5f5"
            border.color: searchInput.activeFocus ? "#333333" : "#e0e0e0"

            TextInput {
                id: searchInput
                anchors.fill: parent
                anchors.margins: 12
                font.pixelSize: 16
                color: "#333333"
                clip: true

                onTextChanged: {
                    root.searchQuery = text
                }

                Text {
                    anchors.fill: parent
                    text: "Type document name..."
                    font.pixelSize: 16
                    color: "#999999"
                    visible: !searchInput.text && !searchInput.activeFocus
                }
            }
        }

        // Results list
        ListView {
            id: resultsList
            width: parent.width
            height: parent.height - 60
            clip: true

            model: root.filteredDocuments

            delegate: Rectangle {
                width: resultsList.width
                height: 40
                radius: 4
                color: index === 0 ? "#f0f0f0" : (resultArea.containsMouse ? "#f8f8f8" : "transparent")

                Row {
                    anchors.left: parent.left
                    anchors.leftMargin: 12
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 8

                    Text {
                        text: "📄"
                        font.pixelSize: 14
                    }

                    Text {
                        text: modelData
                        font.pixelSize: 14
                        color: "#333333"
                    }
                }

                MouseArea {
                    id: resultArea
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: root.documentSelected(modelData)
                }
            }

            // Create new hint
            footer: Rectangle {
                width: resultsList.width
                height: root.searchQuery.length > 0 && !fileManager.documentExists(root.searchQuery) ? 40 : 0
                visible: height > 0

                Row {
                    anchors.left: parent.left
                    anchors.leftMargin: 12
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 8

                    Text {
                        text: "+"
                        font.pixelSize: 16
                        font.bold: true
                        color: "#666666"
                    }

                    Text {
                        text: "Create \"" + root.searchQuery + "\""
                        font.pixelSize: 14
                        color: "#666666"
                        font.italic: true
                    }
                }

                MouseArea {
                    anchors.fill: parent
                    onClicked: root.documentSelected(root.searchQuery)
                }
            }
        }
    }

    // Keyboard handling for the switcher
    Keys.onEscapePressed: root.cancelled()
    Keys.onReturnPressed: root.accept()
    Keys.onEnterPressed: root.accept()

    Component.onCompleted: {
        searchInput.forceActiveFocus()
    }
}

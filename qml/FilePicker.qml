/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * FilePicker.qml - Document selection dialog
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

import QtQuick 2.15
import QtQuick.Controls 2.15

Rectangle {
    id: root
    color: "#ffffff"

    signal fileSelected(string filePath)
    signal cancelled()

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
            text: "Open Document"
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
                onClicked: root.cancelled()
            }
        }
    }

    // Document list
    ListView {
        id: documentList
        anchors.top: header.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: 20

        model: fileManager.documents

        delegate: Rectangle {
            width: documentList.width
            height: 60
            color: delegateArea.pressed ? "#f0f0f0" : "transparent"

            Rectangle {
                anchors.bottom: parent.bottom
                anchors.left: parent.left
                anchors.right: parent.right
                height: 1
                color: "#e0e0e0"
            }

            Text {
                anchors.left: parent.left
                anchors.leftMargin: 20
                anchors.verticalCenter: parent.verticalCenter
                text: modelData
                font.pixelSize: 18
                color: "#333333"
            }

            Text {
                anchors.right: parent.right
                anchors.rightMargin: 20
                anchors.verticalCenter: parent.verticalCenter
                text: "→"
                font.pixelSize: 18
                color: "#999999"
            }

            MouseArea {
                id: delegateArea
                anchors.fill: parent
                onClicked: {
                    root.fileSelected(fileManager.fullPath(modelData))
                }
            }
        }

        // Empty state
        Text {
            anchors.centerIn: parent
            text: "No documents yet.\nPress Ctrl+N to create one."
            horizontalAlignment: Text.AlignHCenter
            font.pixelSize: 16
            color: "#999999"
            visible: documentList.count === 0
        }
    }
}

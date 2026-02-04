QT += quick quickcontrols2 network

CONFIG += c++17

# Application name
TARGET = ghostwriter-pro
TEMPLATE = app

# Version info
VERSION = 0.1.0
DEFINES += APP_VERSION=\\\"$$VERSION\\\"

# Source files
SOURCES += \
    src/main.cpp \
    src/editor.cpp \
    src/filemanager.cpp \
    src/inputhandler.cpp \
    src/aiconfig.cpp \
    src/aiclient.cpp \
    src/aitransform.cpp \
    src/mermaidrenderer.cpp

HEADERS += \
    src/editor.h \
    src/filemanager.h \
    src/inputhandler.h \
    src/aiconfig.h \
    src/aiclient.h \
    src/aitransform.h \
    src/mermaidrenderer.h

# QML files
RESOURCES += qml.qrc

# Additional import path for QML modules
QML_IMPORT_PATH =

# Default rules for deployment
qnx: target.path = /tmp/$${TARGET}/bin
else: unix:!android: target.path = /home/root
!isEmpty(target.path): INSTALLS += target

# reMarkable Paper Pro specific settings
# These are activated when cross-compiling with the Chiappa SDK
chiappa {
    message("Building for reMarkable Paper Pro (Chiappa)")
    
    # E-paper specific defines
    DEFINES += REMARKABLE_PAPERPRO
    
    # Link against evdev for keyboard input
    LIBS += -levdev
}

# Development mode (native build for testing)
!chiappa {
    message("Building for development/testing")
    DEFINES += DEVELOPMENT_BUILD
}

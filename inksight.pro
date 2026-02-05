QT += quick quickcontrols2 network

CONFIG += c++17

# Application name
TARGET = inksight
TEMPLATE = app

# Version info
VERSION = 0.1.0
DEFINES += APP_VERSION=\\\"$$VERSION\\\"

# Source files
SOURCES += \
    src/main.cpp \
    src/inkcapture.cpp \
    src/aiengine.cpp \
    src/transform.cpp \
    src/renderer.cpp

HEADERS += \
    src/inkcapture.h \
    src/aiengine.h \
    src/transform.h \
    src/renderer.h

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

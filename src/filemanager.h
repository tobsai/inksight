/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * filemanager.h - File system operations
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

#ifndef FILEMANAGER_H
#define FILEMANAGER_H

#include <QObject>
#include <QString>
#include <QStringList>

/**
 * @brief The FileManager class handles file system operations.
 *
 * This class provides methods for listing, creating, and deleting documents.
 * It exposes functionality to QML for the file picker interface.
 */
class FileManager : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QString documentDirectory READ documentDirectory WRITE setDocumentDirectory NOTIFY documentDirectoryChanged)
    Q_PROPERTY(QStringList documents READ documents NOTIFY documentsChanged)

public:
    explicit FileManager(QObject *parent = nullptr);

    // Property getters
    QString documentDirectory() const;
    QStringList documents() const;

    // Property setters
    void setDocumentDirectory(const QString &path);

public slots:
    // Document operations
    void refreshDocuments();
    QString createDocument(const QString &name);
    bool deleteDocument(const QString &name);
    bool renameDocument(const QString &oldName, const QString &newName);
    bool documentExists(const QString &name) const;

    // Path utilities
    QString fullPath(const QString &name) const;
    QString baseName(const QString &path) const;

    // Search
    QStringList searchDocuments(const QString &query) const;

signals:
    void documentDirectoryChanged();
    void documentsChanged();
    void documentCreated(const QString &name);
    void documentDeleted(const QString &name);
    void documentRenamed(const QString &oldName, const QString &newName);
    void errorOccurred(const QString &message);

private:
    QString m_documentDirectory;
    QStringList m_documents;

    static const QString FILE_EXTENSION;
};

#endif // FILEMANAGER_H

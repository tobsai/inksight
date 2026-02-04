/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * filemanager.cpp - File system operations implementation
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

#include "filemanager.h"
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QDebug>

const QString FileManager::FILE_EXTENSION = ".md";

FileManager::FileManager(QObject *parent)
    : QObject(parent)
{
}

QString FileManager::documentDirectory() const
{
    return m_documentDirectory;
}

QStringList FileManager::documents() const
{
    return m_documents;
}

void FileManager::setDocumentDirectory(const QString &path)
{
    if (m_documentDirectory != path) {
        m_documentDirectory = path;
        emit documentDirectoryChanged();
        refreshDocuments();
    }
}

void FileManager::refreshDocuments()
{
    m_documents.clear();

    QDir dir(m_documentDirectory);
    if (!dir.exists()) {
        qWarning() << "Document directory does not exist:" << m_documentDirectory;
        emit documentsChanged();
        return;
    }

    QStringList filters;
    filters << "*" + FILE_EXTENSION;
    dir.setNameFilters(filters);
    dir.setSorting(QDir::Time);

    QFileInfoList fileInfoList = dir.entryInfoList(QDir::Files | QDir::Readable);
    for (const QFileInfo &fileInfo : fileInfoList) {
        m_documents.append(fileInfo.baseName());
    }

    emit documentsChanged();
}

QString FileManager::createDocument(const QString &name)
{
    if (name.isEmpty()) {
        emit errorOccurred(tr("Document name cannot be empty"));
        return QString();
    }

    QString safeName = name;
    // Remove invalid characters
    safeName.remove(QRegExp("[\\\\/:*?\"<>|]"));

    if (safeName.isEmpty()) {
        emit errorOccurred(tr("Invalid document name"));
        return QString();
    }

    QString filePath = fullPath(safeName);

    if (QFile::exists(filePath)) {
        emit errorOccurred(tr("Document already exists: %1").arg(safeName));
        return QString();
    }

    QFile file(filePath);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
        emit errorOccurred(tr("Could not create document: %1").arg(safeName));
        return QString();
    }
    file.close();

    refreshDocuments();
    emit documentCreated(safeName);

    return filePath;
}

bool FileManager::deleteDocument(const QString &name)
{
    QString filePath = fullPath(name);

    if (!QFile::exists(filePath)) {
        emit errorOccurred(tr("Document does not exist: %1").arg(name));
        return false;
    }

    if (!QFile::remove(filePath)) {
        emit errorOccurred(tr("Could not delete document: %1").arg(name));
        return false;
    }

    refreshDocuments();
    emit documentDeleted(name);

    return true;
}

bool FileManager::renameDocument(const QString &oldName, const QString &newName)
{
    if (newName.isEmpty()) {
        emit errorOccurred(tr("New document name cannot be empty"));
        return false;
    }

    QString oldPath = fullPath(oldName);
    QString newPath = fullPath(newName);

    if (!QFile::exists(oldPath)) {
        emit errorOccurred(tr("Document does not exist: %1").arg(oldName));
        return false;
    }

    if (QFile::exists(newPath)) {
        emit errorOccurred(tr("Document already exists: %1").arg(newName));
        return false;
    }

    if (!QFile::rename(oldPath, newPath)) {
        emit errorOccurred(tr("Could not rename document"));
        return false;
    }

    refreshDocuments();
    emit documentRenamed(oldName, newName);

    return true;
}

bool FileManager::documentExists(const QString &name) const
{
    return QFile::exists(fullPath(name));
}

QString FileManager::fullPath(const QString &name) const
{
    QString fileName = name;
    if (!fileName.endsWith(FILE_EXTENSION)) {
        fileName += FILE_EXTENSION;
    }
    return m_documentDirectory + "/" + fileName;
}

QString FileManager::baseName(const QString &path) const
{
    QFileInfo fileInfo(path);
    return fileInfo.baseName();
}

QStringList FileManager::searchDocuments(const QString &query) const
{
    if (query.isEmpty()) {
        return m_documents;
    }

    QStringList results;
    QString lowerQuery = query.toLower();

    for (const QString &doc : m_documents) {
        if (doc.toLower().contains(lowerQuery)) {
            results.append(doc);
        }
    }

    return results;
}

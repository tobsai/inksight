/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * mermaidrenderer.cpp - Mermaid diagram rendering implementation
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

#include "mermaidrenderer.h"
#include <QNetworkAccessManager>
#include <QNetworkRequest>
#include <QNetworkReply>
#include <QCryptographicHash>
#include <QFile>
#include <QDir>
#include <QUrl>
#include <QRegularExpression>
#include <QDebug>

const QString MermaidRenderer::MERMAID_INK_URL = "https://mermaid.ink";

MermaidRenderer::MermaidRenderer(QObject *parent)
    : QObject(parent)
    , m_rendering(false)
    , m_offlineMode(false)
    , m_process(nullptr)
{
}

void MermaidRenderer::setCacheDirectory(const QString &path)
{
    m_cacheDirectory = path;
    
    // Ensure cache directory exists
    QDir dir(path + "/mermaid-cache");
    if (!dir.exists()) {
        dir.mkpath(".");
    }
}

QString MermaidRenderer::cacheDirectory() const
{
    return m_cacheDirectory;
}

bool MermaidRenderer::isRendering() const
{
    return m_rendering;
}

bool MermaidRenderer::isOfflineMode() const
{
    return m_offlineMode;
}

void MermaidRenderer::setOfflineMode(bool offline)
{
    if (m_offlineMode != offline) {
        m_offlineMode = offline;
        emit offlineModeChanged();
    }
}

QString MermaidRenderer::cachePathFor(const QString &mermaidCode, const QString &format) const
{
    // Generate hash of Mermaid code for cache key
    QByteArray hash = QCryptographicHash::hash(
        mermaidCode.toUtf8(), 
        QCryptographicHash::Sha256
    ).toHex();
    
    return m_cacheDirectory + "/mermaid-cache/" + hash + "." + format;
}

bool MermaidRenderer::isCached(const QString &mermaidCode, const QString &format) const
{
    return QFile::exists(cachePathFor(mermaidCode, format));
}

void MermaidRenderer::render(const QString &mermaidCode, const QString &outputFormat)
{
    if (m_rendering) {
        emit renderError("Already rendering");
        return;
    }
    
    if (mermaidCode.trimmed().isEmpty()) {
        emit renderError("Empty Mermaid code");
        return;
    }
    
    m_currentCode = mermaidCode;
    m_currentFormat = outputFormat;
    
    // Check cache first
    if (isCached(mermaidCode, outputFormat)) {
        QString cachePath = cachePathFor(mermaidCode, outputFormat);
        emit renderComplete(cachePath);
        return;
    }
    
    // If offline, return text representation
    if (m_offlineMode) {
        emit renderError("Offline mode - diagram rendering unavailable");
        return;
    }
    
    m_rendering = true;
    emit renderingChanged();
    
    // Use server-side rendering
    renderViaServer(mermaidCode, outputFormat);
}

void MermaidRenderer::renderViaServer(const QString &mermaidCode, const QString &outputFormat)
{
    // mermaid.ink accepts base64-encoded diagram definition
    QByteArray encoded = mermaidCode.toUtf8().toBase64(QByteArray::Base64UrlEncoding);
    
    QString endpoint = (outputFormat == "png") ? "/img/" : "/svg/";
    QUrl url(MERMAID_INK_URL + endpoint + encoded);
    
    QNetworkAccessManager *manager = new QNetworkAccessManager(this);
    QNetworkRequest request(url);
    
    // Add headers for e-ink optimized output
    request.setRawHeader("Accept", (outputFormat == "png") ? 
        "image/png" : "image/svg+xml");
    
    QNetworkReply *reply = manager->get(request);
    
    connect(reply, &QNetworkReply::finished, this, [this, reply, manager]() {
        if (reply->error() != QNetworkReply::NoError) {
            m_rendering = false;
            emit renderingChanged();
            emit renderError(reply->errorString());
            reply->deleteLater();
            manager->deleteLater();
            return;
        }
        
        QByteArray data = reply->readAll();
        reply->deleteLater();
        manager->deleteLater();
        
        // Save to cache
        QString cachePath = cachePathFor(m_currentCode, m_currentFormat);
        QFile file(cachePath);
        if (file.open(QIODevice::WriteOnly)) {
            file.write(data);
            file.close();
            
            m_rendering = false;
            emit renderingChanged();
            emit renderComplete(cachePath);
        } else {
            m_rendering = false;
            emit renderingChanged();
            emit renderError("Failed to save rendered diagram");
        }
    });
}

void MermaidRenderer::renderViaLocal(const QString &mermaidCode, const QString &outputFormat)
{
    // Try to use local mmdc (Mermaid CLI) if available
    // This requires Node.js and @mermaid-js/mermaid-cli
    // On reMarkable, this is typically not available, so we fall back to server
    
    m_process = new QProcess(this);
    connect(m_process, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
            this, &MermaidRenderer::onProcessFinished);
    
    // Write Mermaid code to temp file
    QString tempInput = m_cacheDirectory + "/temp.mmd";
    QString outputPath = cachePathFor(mermaidCode, outputFormat);
    
    QFile file(tempInput);
    if (!file.open(QIODevice::WriteOnly)) {
        m_rendering = false;
        emit renderingChanged();
        emit renderError("Could not create temp file");
        return;
    }
    file.write(mermaidCode.toUtf8());
    file.close();
    
    // Run mmdc
    QStringList args;
    args << "-i" << tempInput;
    args << "-o" << outputPath;
    args << "-b" << "white";  // White background for e-ink
    
    m_process->start("mmdc", args);
    
    if (!m_process->waitForStarted(1000)) {
        // mmdc not available, fall back to server
        m_process->deleteLater();
        m_process = nullptr;
        renderViaServer(mermaidCode, outputFormat);
    }
}

void MermaidRenderer::onProcessFinished(int exitCode, QProcess::ExitStatus exitStatus)
{
    Q_UNUSED(exitStatus);
    
    if (m_process) {
        m_process->deleteLater();
        m_process = nullptr;
    }
    
    m_rendering = false;
    emit renderingChanged();
    
    if (exitCode == 0) {
        QString outputPath = cachePathFor(m_currentCode, m_currentFormat);
        emit renderComplete(outputPath);
    } else {
        emit renderError("Local rendering failed");
    }
}

void MermaidRenderer::cancel()
{
    if (m_process) {
        m_process->kill();
        m_process->deleteLater();
        m_process = nullptr;
    }
    m_rendering = false;
    emit renderingChanged();
}

void MermaidRenderer::clearCache()
{
    QDir cacheDir(m_cacheDirectory + "/mermaid-cache");
    if (cacheDir.exists()) {
        cacheDir.removeRecursively();
        cacheDir.mkpath(".");
    }
}

QString MermaidRenderer::renderToText(const QString &mermaidCode) const
{
    QString code = mermaidCode.trimmed();
    
    // Detect diagram type and parse accordingly
    if (code.startsWith("graph ") || code.startsWith("flowchart ")) {
        return parseFlowchartToText(code);
    } else if (code.startsWith("sequenceDiagram")) {
        return parseSequenceToText(code);
    } else if (code.startsWith("mindmap")) {
        return parseMindmapToText(code);
    }
    
    // Generic fallback: just clean up the code
    QString result = "=== Diagram ===\n\n";
    result += code;
    result += "\n\n===============\n";
    result += "(Render unavailable - view as Mermaid code)";
    return result;
}

QString MermaidRenderer::parseFlowchartToText(const QString &code) const
{
    QString result = "=== Flowchart ===\n\n";
    
    // Extract nodes and connections
    QRegularExpression nodeRe(R"((\w+)\s*\[([^\]]+)\])");
    QRegularExpression edgeRe(R"((\w+)\s*-->?\|?([^|]*)\|?\s*(\w+))");
    
    QMap<QString, QString> nodes;
    QStringList edges;
    
    // Parse nodes
    QRegularExpressionMatchIterator nodeIt = nodeRe.globalMatch(code);
    while (nodeIt.hasNext()) {
        QRegularExpressionMatch match = nodeIt.next();
        nodes[match.captured(1)] = match.captured(2);
    }
    
    // Parse edges
    QRegularExpressionMatchIterator edgeIt = edgeRe.globalMatch(code);
    while (edgeIt.hasNext()) {
        QRegularExpressionMatch match = edgeIt.next();
        QString from = match.captured(1);
        QString label = match.captured(2).trimmed();
        QString to = match.captured(3);
        
        QString fromLabel = nodes.contains(from) ? nodes[from] : from;
        QString toLabel = nodes.contains(to) ? nodes[to] : to;
        
        if (label.isEmpty()) {
            edges << QString("  %1 → %2").arg(fromLabel, toLabel);
        } else {
            edges << QString("  %1 -[%2]→ %3").arg(fromLabel, label, toLabel);
        }
    }
    
    // Build text output
    if (!nodes.isEmpty()) {
        result += "Steps:\n";
        for (auto it = nodes.begin(); it != nodes.end(); ++it) {
            result += QString("  • %1\n").arg(it.value());
        }
        result += "\n";
    }
    
    if (!edges.isEmpty()) {
        result += "Flow:\n";
        result += edges.join("\n");
    }
    
    return result;
}

QString MermaidRenderer::parseSequenceToText(const QString &code) const
{
    QString result = "=== Sequence Diagram ===\n\n";
    
    // Extract participants
    QRegularExpression participantRe(R"(participant\s+(\w+)(?:\s+as\s+(.+))?)");
    QRegularExpression messageRe(R"((\w+)\s*(->>?|-->>?)\s*(\w+)\s*:\s*(.+))");
    
    QStringList participants;
    QStringList messages;
    
    QRegularExpressionMatchIterator partIt = participantRe.globalMatch(code);
    while (partIt.hasNext()) {
        QRegularExpressionMatch match = partIt.next();
        QString name = match.captured(2).isEmpty() ? match.captured(1) : match.captured(2);
        participants << name;
    }
    
    QRegularExpressionMatchIterator msgIt = messageRe.globalMatch(code);
    while (msgIt.hasNext()) {
        QRegularExpressionMatch match = msgIt.next();
        QString from = match.captured(1);
        QString arrow = match.captured(2).contains("--") ? "···>" : "──>";
        QString to = match.captured(3);
        QString msg = match.captured(4).trimmed();
        
        messages << QString("  %1 %2 %3: %4").arg(from, arrow, to, msg);
    }
    
    if (!participants.isEmpty()) {
        result += "Participants: " + participants.join(", ") + "\n\n";
    }
    
    if (!messages.isEmpty()) {
        result += "Messages:\n";
        result += messages.join("\n");
    }
    
    return result;
}

QString MermaidRenderer::parseMindmapToText(const QString &code) const
{
    QString result = "=== Mind Map ===\n\n";
    
    // Simple indentation-based parsing
    QStringList lines = code.split('\n');
    
    for (const QString &line : lines) {
        QString trimmed = line.trimmed();
        if (trimmed.isEmpty() || trimmed == "mindmap") continue;
        
        // Count leading spaces for indentation level
        int indent = 0;
        for (int i = 0; i < line.length() && line[i] == ' '; ++i) {
            indent++;
        }
        
        int level = indent / 2;  // Assuming 2-space indentation
        QString prefix = QString("  ").repeated(level);
        QString bullet = (level == 0) ? "◉" : (level == 1) ? "○" : "·";
        
        // Clean up the node text
        QString text = trimmed;
        text.remove(QRegularExpression(R"(^\s*[\(\[\{])"));
        text.remove(QRegularExpression(R"([\)\]\}]\s*$)"));
        
        if (!text.isEmpty()) {
            result += prefix + bullet + " " + text + "\n";
        }
    }
    
    return result;
}

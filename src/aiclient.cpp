/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * aiclient.cpp - AI provider API client implementation
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

#include "aiclient.h"
#include <QNetworkRequest>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QRegularExpression>
#include <QDebug>

AIClient::AIClient(QObject *parent)
    : QObject(parent)
    , m_config(nullptr)
    , m_networkManager(new QNetworkAccessManager(this))
    , m_currentReply(nullptr)
    , m_busy(false)
    , m_expectsMermaid(false)
{
    connect(m_networkManager, &QNetworkAccessManager::finished,
            this, &AIClient::onRequestFinished);
}

void AIClient::setConfig(AIConfig *config)
{
    m_config = config;
}

bool AIClient::isBusy() const
{
    return m_busy;
}

QString AIClient::statusMessage() const
{
    return m_statusMessage;
}

void AIClient::setBusy(bool busy)
{
    if (m_busy != busy) {
        m_busy = busy;
        emit busyChanged();
    }
}

void AIClient::setStatusMessage(const QString &message)
{
    if (m_statusMessage != message) {
        m_statusMessage = message;
        emit statusMessageChanged();
    }
}

QString AIClient::buildSystemPrompt(const QString &templateId) const
{
    if (!m_config) return QString();
    
    for (const auto &pt : m_config->promptTemplates()) {
        if (pt.id == templateId) {
            return pt.prompt;
        }
    }
    return QString();
}

void AIClient::transform(const QString &text, const QString &promptTemplate, const QString &customPrompt)
{
    if (!m_config) {
        emit transformError("AI not configured");
        return;
    }
    
    if (!m_config->isConfigured()) {
        emit transformError("AI provider not configured. Please set up an API key in settings.");
        return;
    }
    
    if (m_busy) {
        emit transformError("Already processing a request");
        return;
    }
    
    m_currentTemplateId = promptTemplate;
    
    // Get the system prompt
    QString systemPrompt;
    if (promptTemplate == "custom") {
        systemPrompt = customPrompt;
        m_expectsMermaid = customPrompt.contains("mermaid", Qt::CaseInsensitive) ||
                          customPrompt.contains("diagram", Qt::CaseInsensitive) ||
                          customPrompt.contains("flowchart", Qt::CaseInsensitive);
    } else {
        systemPrompt = buildSystemPrompt(promptTemplate);
        // Check if this template expects Mermaid output
        for (const auto &pt : m_config->promptTemplates()) {
            if (pt.id == promptTemplate) {
                m_expectsMermaid = pt.expectsMermaid;
                break;
            }
        }
    }
    
    if (systemPrompt.isEmpty()) {
        emit transformError("Invalid prompt template");
        return;
    }
    
    setBusy(true);
    setStatusMessage("Connecting to AI...");
    
    // Send to appropriate provider
    switch (m_config->currentProvider()) {
        case AIProvider::OpenAI:
            sendOpenAIRequest(systemPrompt, text);
            break;
        case AIProvider::Anthropic:
            sendAnthropicRequest(systemPrompt, text);
            break;
        case AIProvider::Ollama:
            sendOllamaRequest(systemPrompt, text);
            break;
        default:
            setBusy(false);
            emit transformError("No AI provider configured");
            break;
    }
}

void AIClient::cancel()
{
    if (m_currentReply) {
        m_currentReply->abort();
        m_currentReply = nullptr;
    }
    setBusy(false);
    setStatusMessage("");
}

void AIClient::testConnection()
{
    if (!m_config || !m_config->isConfigured()) {
        emit connectionTestResult(false, "Not configured");
        return;
    }
    
    // Simple test - try a minimal request
    transform("test", "summarize");
}

void AIClient::sendOpenAIRequest(const QString &systemPrompt, const QString &userContent)
{
    QNetworkRequest request;
    request.setUrl(QUrl("https://api.openai.com/v1/chat/completions"));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    request.setRawHeader("Authorization", 
        QString("Bearer %1").arg(m_config->apiKey(AIProvider::OpenAI)).toUtf8());
    
    QJsonObject message1;
    message1["role"] = "system";
    message1["content"] = systemPrompt;
    
    QJsonObject message2;
    message2["role"] = "user";
    message2["content"] = userContent;
    
    QJsonArray messages;
    messages.append(message1);
    messages.append(message2);
    
    QJsonObject body;
    body["model"] = m_config->openaiModel();
    body["messages"] = messages;
    body["max_tokens"] = 4096;
    body["temperature"] = 0.7;
    
    QJsonDocument doc(body);
    
    setStatusMessage("Waiting for OpenAI response...");
    m_currentReply = m_networkManager->post(request, doc.toJson());
}

void AIClient::sendAnthropicRequest(const QString &systemPrompt, const QString &userContent)
{
    QNetworkRequest request;
    request.setUrl(QUrl("https://api.anthropic.com/v1/messages"));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    request.setRawHeader("x-api-key", m_config->apiKey(AIProvider::Anthropic).toUtf8());
    request.setRawHeader("anthropic-version", "2023-06-01");
    
    QJsonObject message;
    message["role"] = "user";
    message["content"] = userContent;
    
    QJsonArray messages;
    messages.append(message);
    
    QJsonObject body;
    body["model"] = m_config->anthropicModel();
    body["system"] = systemPrompt;
    body["messages"] = messages;
    body["max_tokens"] = 4096;
    
    QJsonDocument doc(body);
    
    setStatusMessage("Waiting for Claude response...");
    m_currentReply = m_networkManager->post(request, doc.toJson());
}

void AIClient::sendOllamaRequest(const QString &systemPrompt, const QString &userContent)
{
    QNetworkRequest request;
    QString url = m_config->ollamaUrl();
    if (!url.endsWith('/')) url += '/';
    request.setUrl(QUrl(url + "api/chat"));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    
    QJsonObject systemMessage;
    systemMessage["role"] = "system";
    systemMessage["content"] = systemPrompt;
    
    QJsonObject userMessage;
    userMessage["role"] = "user";
    userMessage["content"] = userContent;
    
    QJsonArray messages;
    messages.append(systemMessage);
    messages.append(userMessage);
    
    QJsonObject body;
    body["model"] = m_config->ollamaModel();
    body["messages"] = messages;
    body["stream"] = false;
    
    QJsonDocument doc(body);
    
    setStatusMessage("Waiting for Ollama response...");
    m_currentReply = m_networkManager->post(request, doc.toJson());
}

void AIClient::onRequestFinished(QNetworkReply *reply)
{
    if (reply != m_currentReply) {
        reply->deleteLater();
        return;
    }
    
    m_currentReply = nullptr;
    
    if (reply->error() != QNetworkReply::NoError) {
        QString errorMsg = reply->errorString();
        
        // Try to extract more specific error from response
        QByteArray data = reply->readAll();
        if (!data.isEmpty()) {
            QJsonDocument doc = QJsonDocument::fromJson(data);
            if (!doc.isNull()) {
                QJsonObject obj = doc.object();
                if (obj.contains("error")) {
                    QJsonObject error = obj["error"].toObject();
                    if (error.contains("message")) {
                        errorMsg = error["message"].toString();
                    }
                }
            }
        }
        
        setBusy(false);
        setStatusMessage("");
        emit transformError(errorMsg);
        reply->deleteLater();
        return;
    }
    
    QByteArray data = reply->readAll();
    reply->deleteLater();
    
    setStatusMessage("Processing response...");
    
    AIResponse response;
    
    switch (m_config->currentProvider()) {
        case AIProvider::OpenAI:
            response = parseOpenAIResponse(data);
            break;
        case AIProvider::Anthropic:
            response = parseAnthropicResponse(data);
            break;
        case AIProvider::Ollama:
            response = parseOllamaResponse(data);
            break;
        default:
            response.success = false;
            response.error = "Unknown provider";
            break;
    }
    
    // Check for Mermaid content
    if (response.success && (m_expectsMermaid || containsMermaid(response.content))) {
        response.isMermaid = true;
        response.mermaidCode = extractMermaidCode(response.content);
        if (response.mermaidCode.isEmpty() && m_expectsMermaid) {
            // Try to use the whole content as Mermaid
            response.mermaidCode = response.content.trimmed();
        }
    }
    
    setBusy(false);
    setStatusMessage("");
    
    if (response.success) {
        emit transformComplete(response);
    } else {
        emit transformError(response.error);
    }
}

AIResponse AIClient::parseOpenAIResponse(const QByteArray &data)
{
    AIResponse response;
    response.success = false;
    response.isMermaid = false;
    response.tokensUsed = 0;
    
    QJsonDocument doc = QJsonDocument::fromJson(data);
    if (doc.isNull()) {
        response.error = "Invalid JSON response";
        return response;
    }
    
    QJsonObject root = doc.object();
    
    if (root.contains("error")) {
        response.error = root["error"].toObject()["message"].toString();
        return response;
    }
    
    QJsonArray choices = root["choices"].toArray();
    if (choices.isEmpty()) {
        response.error = "No response content";
        return response;
    }
    
    QJsonObject message = choices[0].toObject()["message"].toObject();
    response.content = message["content"].toString();
    response.success = true;
    
    // Extract usage
    if (root.contains("usage")) {
        response.tokensUsed = root["usage"].toObject()["total_tokens"].toInt();
    }
    
    return response;
}

AIResponse AIClient::parseAnthropicResponse(const QByteArray &data)
{
    AIResponse response;
    response.success = false;
    response.isMermaid = false;
    response.tokensUsed = 0;
    
    QJsonDocument doc = QJsonDocument::fromJson(data);
    if (doc.isNull()) {
        response.error = "Invalid JSON response";
        return response;
    }
    
    QJsonObject root = doc.object();
    
    if (root.contains("error")) {
        response.error = root["error"].toObject()["message"].toString();
        return response;
    }
    
    QJsonArray content = root["content"].toArray();
    if (content.isEmpty()) {
        response.error = "No response content";
        return response;
    }
    
    // Anthropic returns content as array of blocks
    QString fullContent;
    for (const auto &block : content) {
        QJsonObject blockObj = block.toObject();
        if (blockObj["type"].toString() == "text") {
            fullContent += blockObj["text"].toString();
        }
    }
    
    response.content = fullContent;
    response.success = true;
    
    // Extract usage
    if (root.contains("usage")) {
        QJsonObject usage = root["usage"].toObject();
        response.tokensUsed = usage["input_tokens"].toInt() + usage["output_tokens"].toInt();
    }
    
    return response;
}

AIResponse AIClient::parseOllamaResponse(const QByteArray &data)
{
    AIResponse response;
    response.success = false;
    response.isMermaid = false;
    response.tokensUsed = 0;
    
    QJsonDocument doc = QJsonDocument::fromJson(data);
    if (doc.isNull()) {
        response.error = "Invalid JSON response";
        return response;
    }
    
    QJsonObject root = doc.object();
    
    if (root.contains("error")) {
        response.error = root["error"].toString();
        return response;
    }
    
    QJsonObject message = root["message"].toObject();
    response.content = message["content"].toString();
    response.success = !response.content.isEmpty();
    
    if (!response.success) {
        response.error = "Empty response from Ollama";
    }
    
    // Ollama provides eval_count
    if (root.contains("eval_count")) {
        response.tokensUsed = root["eval_count"].toInt();
    }
    
    return response;
}

bool AIClient::containsMermaid(const QString &content) const
{
    return content.contains("```mermaid") ||
           content.contains("graph ") ||
           content.contains("flowchart ") ||
           content.contains("sequenceDiagram") ||
           content.contains("mindmap");
}

QString AIClient::extractMermaidCode(const QString &content) const
{
    // Try to extract code from markdown code block
    QRegularExpression re("```mermaid\\s*([\\s\\S]*?)```");
    QRegularExpressionMatch match = re.match(content);
    
    if (match.hasMatch()) {
        return match.captured(1).trimmed();
    }
    
    // Try generic code block
    QRegularExpression re2("```\\s*([\\s\\S]*?)```");
    match = re2.match(content);
    
    if (match.hasMatch()) {
        QString code = match.captured(1).trimmed();
        // Check if it looks like Mermaid
        if (code.startsWith("graph ") || 
            code.startsWith("flowchart ") ||
            code.startsWith("sequenceDiagram") ||
            code.startsWith("mindmap") ||
            code.startsWith("classDiagram") ||
            code.startsWith("stateDiagram") ||
            code.startsWith("erDiagram") ||
            code.startsWith("journey") ||
            code.startsWith("gantt") ||
            code.startsWith("pie")) {
            return code;
        }
    }
    
    return QString();
}

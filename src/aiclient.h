/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * aiclient.h - AI provider API client
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

#ifndef AICLIENT_H
#define AICLIENT_H

#include <QObject>
#include <QString>
#include <QNetworkAccessManager>
#include <QNetworkReply>

#include "aiconfig.h"

/**
 * @brief The AIResponse struct holds the result of an AI request.
 */
struct AIResponse {
    bool success;
    QString content;
    QString error;
    bool isMermaid;
    QString mermaidCode;  // Extracted Mermaid code if present
    int tokensUsed;
};

/**
 * @brief The AIClient class handles communication with AI providers.
 *
 * This class provides async API calls to OpenAI, Anthropic, and local Ollama
 * instances. It handles request formatting, response parsing, and error handling
 * for each provider's specific API format.
 */
class AIClient : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool busy READ isBusy NOTIFY busyChanged)
    Q_PROPERTY(QString statusMessage READ statusMessage NOTIFY statusMessageChanged)

public:
    explicit AIClient(QObject *parent = nullptr);

    // Configuration
    void setConfig(AIConfig *config);

    // State
    bool isBusy() const;
    QString statusMessage() const;

public slots:
    /**
     * @brief transform - Main entry point for text transformation
     * @param text - The selected text to transform
     * @param promptTemplate - The prompt template ID or custom prompt
     * @param customPrompt - Custom prompt text (if promptTemplate is "custom")
     */
    void transform(const QString &text, const QString &promptTemplate, const QString &customPrompt = QString());
    
    /**
     * @brief cancel - Cancel any in-progress request
     */
    void cancel();
    
    /**
     * @brief testConnection - Test connection to current provider
     */
    void testConnection();

signals:
    void transformComplete(const AIResponse &response);
    void transformError(const QString &error);
    void busyChanged();
    void statusMessageChanged();
    void connectionTestResult(bool success, const QString &message);

private slots:
    void onRequestFinished(QNetworkReply *reply);

private:
    // Provider-specific request handlers
    void sendOpenAIRequest(const QString &systemPrompt, const QString &userContent);
    void sendAnthropicRequest(const QString &systemPrompt, const QString &userContent);
    void sendOllamaRequest(const QString &systemPrompt, const QString &userContent);
    
    // Response parsers
    AIResponse parseOpenAIResponse(const QByteArray &data);
    AIResponse parseAnthropicResponse(const QByteArray &data);
    AIResponse parseOllamaResponse(const QByteArray &data);
    
    // Mermaid extraction
    QString extractMermaidCode(const QString &content) const;
    bool containsMermaid(const QString &content) const;
    
    // Prompt building
    QString buildSystemPrompt(const QString &templateId) const;
    
    void setBusy(bool busy);
    void setStatusMessage(const QString &message);
    
    AIConfig *m_config;
    QNetworkAccessManager *m_networkManager;
    QNetworkReply *m_currentReply;
    bool m_busy;
    QString m_statusMessage;
    bool m_expectsMermaid;
    
    // Request context
    QString m_currentTemplateId;
};

#endif // AICLIENT_H

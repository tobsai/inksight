/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * aitransform.h - AI text transformation coordinator
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

#ifndef AITRANSFORM_H
#define AITRANSFORM_H

#include <QObject>
#include <QString>
#include <QVariantList>

#include "aiconfig.h"
#include "aiclient.h"
#include "mermaidrenderer.h"

class Editor;

/**
 * @brief The AITransform class coordinates AI-powered text transformations.
 *
 * This class serves as the main coordinator between the UI, AI client,
 * Mermaid renderer, and editor. It manages the complete workflow:
 * 1. Text selection → 2. Prompt selection → 3. AI call → 4. Result processing → 5. Injection
 */
class AITransform : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool busy READ isBusy NOTIFY busyChanged)
    Q_PROPERTY(bool hasSelection READ hasSelection NOTIFY selectionChanged)
    Q_PROPERTY(QString selectedText READ selectedText NOTIFY selectionChanged)
    Q_PROPERTY(QString statusMessage READ statusMessage NOTIFY statusMessageChanged)
    Q_PROPERTY(bool isConfigured READ isConfigured NOTIFY configChanged)
    Q_PROPERTY(QVariantList promptTemplates READ promptTemplates NOTIFY configChanged)
    Q_PROPERTY(QString lastResult READ lastResult NOTIFY resultChanged)
    Q_PROPERTY(bool lastResultIsMermaid READ lastResultIsMermaid NOTIFY resultChanged)
    Q_PROPERTY(QString lastMermaidImagePath READ lastMermaidImagePath NOTIFY resultChanged)

public:
    explicit AITransform(QObject *parent = nullptr);

    // Set dependencies
    void setEditor(Editor *editor);
    void setConfigDirectory(const QString &path);

    // Components access
    AIConfig* config() const { return m_config; }
    AIClient* client() const { return m_client; }
    MermaidRenderer* renderer() const { return m_renderer; }

    // State properties
    bool isBusy() const;
    bool hasSelection() const;
    QString selectedText() const;
    QString statusMessage() const;
    bool isConfigured() const;
    QVariantList promptTemplates() const;
    QString lastResult() const;
    bool lastResultIsMermaid() const;
    QString lastMermaidImagePath() const;

public slots:
    // Selection management
    void setSelection(int start, int end);
    void clearSelection();
    
    // Transform operations
    void transform(const QString &promptTemplateId, const QString &customPrompt = QString());
    void cancel();
    
    // Result handling
    void acceptResult();
    void replaceSelection();
    void insertAfterSelection();
    void discardResult();
    
    // Configuration
    void openSettings();

signals:
    void busyChanged();
    void selectionChanged();
    void statusMessageChanged();
    void configChanged();
    void resultChanged();
    
    // UI signals
    void showPromptPalette();
    void hidePromptPalette();
    void showResult(const QString &result, bool isMermaid, const QString &imagePath);
    void showSettings();
    void showError(const QString &error);
    void transformComplete();

private slots:
    void onTransformComplete(const AIResponse &response);
    void onTransformError(const QString &error);
    void onRenderComplete(const QString &imagePath);
    void onRenderError(const QString &error);

private:
    void setStatusMessage(const QString &message);
    
    Editor *m_editor;
    AIConfig *m_config;
    AIClient *m_client;
    MermaidRenderer *m_renderer;
    
    // Selection state
    int m_selectionStart;
    int m_selectionEnd;
    QString m_selectedText;
    
    // Result state
    QString m_lastResult;
    bool m_lastResultIsMermaid;
    QString m_lastMermaidCode;
    QString m_lastMermaidImagePath;
    
    // Status
    QString m_statusMessage;
    bool m_busy;
};

#endif // AITRANSFORM_H

/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * mermaidrenderer.h - Mermaid diagram rendering
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

#ifndef MERMAIDRENDERER_H
#define MERMAIDRENDERER_H

#include <QObject>
#include <QString>
#include <QProcess>

/**
 * @brief The MermaidRenderer class handles Mermaid diagram rendering.
 *
 * This class converts Mermaid diagram code into SVG or PNG images suitable
 * for display on the e-ink screen. It uses either an embedded Mermaid renderer
 * or falls back to server-side rendering for complex diagrams.
 *
 * On the reMarkable, we primarily use server-side rendering via mermaid.ink
 * to avoid heavy dependencies. For offline use, diagrams are rendered as
 * formatted text fallback.
 */
class MermaidRenderer : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool rendering READ isRendering NOTIFY renderingChanged)
    Q_PROPERTY(bool offlineMode READ isOfflineMode WRITE setOfflineMode NOTIFY offlineModeChanged)

public:
    explicit MermaidRenderer(QObject *parent = nullptr);

    // Configuration
    void setCacheDirectory(const QString &path);
    QString cacheDirectory() const;

    // State
    bool isRendering() const;
    bool isOfflineMode() const;
    void setOfflineMode(bool offline);

public slots:
    /**
     * @brief render - Render Mermaid code to an image
     * @param mermaidCode - The Mermaid diagram code
     * @param outputFormat - "svg" or "png" (default: svg for e-ink)
     */
    void render(const QString &mermaidCode, const QString &outputFormat = "svg");
    
    /**
     * @brief renderToText - Convert Mermaid to ASCII/text representation
     * @param mermaidCode - The Mermaid diagram code
     *
     * Used as fallback for offline mode or when rendering fails.
     */
    QString renderToText(const QString &mermaidCode) const;
    
    /**
     * @brief cancel - Cancel any in-progress rendering
     */
    void cancel();
    
    /**
     * @brief clearCache - Clear the diagram cache
     */
    void clearCache();

signals:
    void renderComplete(const QString &imagePath);
    void renderError(const QString &error);
    void renderingChanged();
    void offlineModeChanged();

private slots:
    void onProcessFinished(int exitCode, QProcess::ExitStatus exitStatus);

private:
    // Server-side rendering via mermaid.ink
    void renderViaServer(const QString &mermaidCode, const QString &outputFormat);
    
    // Local rendering via mmdc (if available)
    void renderViaLocal(const QString &mermaidCode, const QString &outputFormat);
    
    // Generate cache path for a diagram
    QString cachePathFor(const QString &mermaidCode, const QString &format) const;
    
    // Check if diagram is cached
    bool isCached(const QString &mermaidCode, const QString &format) const;
    
    // Parse Mermaid for text fallback
    QString parseFlowchartToText(const QString &code) const;
    QString parseSequenceToText(const QString &code) const;
    QString parseMindmapToText(const QString &code) const;
    
    QString m_cacheDirectory;
    bool m_rendering;
    bool m_offlineMode;
    QProcess *m_process;
    QString m_currentCode;
    QString m_currentFormat;
    
    // Server URL for rendering
    static const QString MERMAID_INK_URL;
};

#endif // MERMAIDRENDERER_H

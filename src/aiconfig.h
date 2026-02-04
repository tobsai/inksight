/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * aiconfig.h - AI configuration management
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

#ifndef AICONFIG_H
#define AICONFIG_H

#include <QObject>
#include <QString>
#include <QStringList>
#include <QVariantMap>
#include <QJsonObject>

/**
 * @brief The AIProvider enum represents supported AI backends.
 */
enum class AIProvider {
    None,
    OpenAI,
    Anthropic,
    Ollama
};

/**
 * @brief The PromptTemplate struct holds predefined prompt configurations.
 */
struct PromptTemplate {
    QString id;
    QString name;
    QString icon;
    QString prompt;
    QString description;
    bool expectsMermaid;
    
    QVariantMap toVariantMap() const {
        return {
            {"id", id},
            {"name", name},
            {"icon", icon},
            {"prompt", prompt},
            {"description", description},
            {"expectsMermaid", expectsMermaid}
        };
    }
};

/**
 * @brief The AIConfig class manages AI provider configuration.
 *
 * This class handles loading and saving AI configuration including API keys,
 * provider selection, and prompt templates. Configuration is stored in a
 * JSON file in the user's ghostwriter directory.
 */
class AIConfig : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QString currentProvider READ currentProviderName WRITE setCurrentProviderByName NOTIFY configChanged)
    Q_PROPERTY(bool isConfigured READ isConfigured NOTIFY configChanged)
    Q_PROPERTY(QVariantList promptTemplates READ promptTemplatesVariant NOTIFY configChanged)
    Q_PROPERTY(QString ollamaUrl READ ollamaUrl WRITE setOllamaUrl NOTIFY configChanged)
    Q_PROPERTY(QString ollamaModel READ ollamaModel WRITE setOllamaModel NOTIFY configChanged)
    Q_PROPERTY(QString openaiModel READ openaiModel WRITE setOpenaiModel NOTIFY configChanged)
    Q_PROPERTY(QString anthropicModel READ anthropicModel WRITE setAnthropicModel NOTIFY configChanged)

public:
    explicit AIConfig(QObject *parent = nullptr);

    // Configuration path
    void setConfigDirectory(const QString &path);
    QString configDirectory() const;

    // Provider management
    AIProvider currentProvider() const;
    QString currentProviderName() const;
    void setCurrentProvider(AIProvider provider);
    void setCurrentProviderByName(const QString &name);

    // API Keys (stored securely)
    QString apiKey(AIProvider provider) const;
    void setApiKey(AIProvider provider, const QString &key);

    // Provider-specific settings
    QString ollamaUrl() const;
    void setOllamaUrl(const QString &url);
    
    QString ollamaModel() const;
    void setOllamaModel(const QString &model);
    
    QString openaiModel() const;
    void setOpenaiModel(const QString &model);
    
    QString anthropicModel() const;
    void setAnthropicModel(const QString &model);

    // Configuration status
    bool isConfigured() const;
    bool hasApiKey(AIProvider provider) const;

    // Prompt templates
    QList<PromptTemplate> promptTemplates() const;
    QVariantList promptTemplatesVariant() const;
    void addCustomPrompt(const PromptTemplate &prompt);
    void removeCustomPrompt(const QString &id);

    // Persistence
    bool loadConfig();
    bool saveConfig();

public slots:
    void setOpenAIKey(const QString &key);
    void setAnthropicKey(const QString &key);
    QString getProviderDisplayName(const QString &provider) const;
    QStringList availableProviders() const;

signals:
    void configChanged();
    void configLoaded();
    void configSaved();
    void errorOccurred(const QString &message);

private:
    void initDefaultPrompts();
    QString configFilePath() const;
    
    QString m_configDirectory;
    AIProvider m_currentProvider;
    
    // API Keys
    QString m_openaiKey;
    QString m_anthropicKey;
    
    // Provider settings
    QString m_ollamaUrl;
    QString m_ollamaModel;
    QString m_openaiModel;
    QString m_anthropicModel;
    
    // Prompt templates
    QList<PromptTemplate> m_promptTemplates;
    QList<PromptTemplate> m_customPrompts;
    
    // Defaults
    static const QString DEFAULT_OLLAMA_URL;
    static const QString DEFAULT_OLLAMA_MODEL;
    static const QString DEFAULT_OPENAI_MODEL;
    static const QString DEFAULT_ANTHROPIC_MODEL;
};

#endif // AICONFIG_H

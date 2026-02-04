/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * aiconfig.cpp - AI configuration management implementation
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

#include "aiconfig.h"
#include <QFile>
#include <QJsonDocument>
#include <QJsonArray>
#include <QDir>
#include <QDebug>

const QString AIConfig::DEFAULT_OLLAMA_URL = "http://localhost:11434";
const QString AIConfig::DEFAULT_OLLAMA_MODEL = "llama3.2";
const QString AIConfig::DEFAULT_OPENAI_MODEL = "gpt-4o";
const QString AIConfig::DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

AIConfig::AIConfig(QObject *parent)
    : QObject(parent)
    , m_currentProvider(AIProvider::None)
    , m_ollamaUrl(DEFAULT_OLLAMA_URL)
    , m_ollamaModel(DEFAULT_OLLAMA_MODEL)
    , m_openaiModel(DEFAULT_OPENAI_MODEL)
    , m_anthropicModel(DEFAULT_ANTHROPIC_MODEL)
{
    initDefaultPrompts();
}

void AIConfig::initDefaultPrompts()
{
    m_promptTemplates.clear();
    
    // Process Flow / Mermaid diagram
    m_promptTemplates.append({
        "mermaid-flowchart",
        "Process Flow",
        "🔄",
        "Convert this text into a Mermaid flowchart diagram. Analyze the steps, decisions, and flow described and create a clear flowchart. Return ONLY the Mermaid code starting with ```mermaid and ending with ```. The diagram should be readable and well-organized.",
        "Convert text to Mermaid flowchart",
        true
    });
    
    // Sequence diagram
    m_promptTemplates.append({
        "mermaid-sequence",
        "Sequence Diagram",
        "📊",
        "Convert this text into a Mermaid sequence diagram. Identify the actors/participants and their interactions. Return ONLY the Mermaid code starting with ```mermaid and ending with ```. Focus on clear, chronological message flow.",
        "Convert interactions to sequence diagram",
        true
    });
    
    // Mind map
    m_promptTemplates.append({
        "mermaid-mindmap",
        "Mind Map",
        "🧠",
        "Convert this text into a Mermaid mindmap diagram. Identify the central concept and related ideas. Return ONLY the Mermaid code starting with ```mermaid and ending with ```. Organize hierarchically.",
        "Convert ideas to mind map",
        true
    });
    
    // Summary
    m_promptTemplates.append({
        "summarize",
        "Summarize",
        "📝",
        "Provide a clear, concise summary of this text. Capture the key points and main ideas. Keep the summary to about 20-30% of the original length while preserving essential information.",
        "Create a concise summary",
        false
    });
    
    // Expand
    m_promptTemplates.append({
        "expand",
        "Expand",
        "📖",
        "Expand on this text with more detail, examples, and explanation. Maintain the original tone and style while adding depth. Aim for about 2-3x the original length with meaningful additions.",
        "Expand with more detail",
        false
    });
    
    // Bullet points
    m_promptTemplates.append({
        "bullets",
        "Bullet Points",
        "•",
        "Convert this text into well-organized bullet points. Use hierarchical structure where appropriate. Each bullet should be concise but complete.",
        "Convert to bullet points",
        false
    });
    
    // Improve writing
    m_promptTemplates.append({
        "improve",
        "Improve Writing",
        "✨",
        "Improve this text for clarity, flow, and readability. Fix any grammatical errors, improve word choice, and enhance the overall quality while preserving the original meaning and voice.",
        "Improve clarity and style",
        false
    });
    
    // Simplify
    m_promptTemplates.append({
        "simplify",
        "Simplify",
        "🎯",
        "Simplify this text to make it easier to understand. Use shorter sentences, simpler words, and clearer explanations. Aim for a reading level accessible to a general audience.",
        "Make easier to understand",
        false
    });
    
    // Make formal
    m_promptTemplates.append({
        "formal",
        "Make Formal",
        "👔",
        "Rewrite this text in a formal, professional tone suitable for business or academic contexts. Use appropriate vocabulary and structure while preserving the content.",
        "Convert to formal tone",
        false
    });
    
    // Make casual
    m_promptTemplates.append({
        "casual",
        "Make Casual",
        "😊",
        "Rewrite this text in a friendly, conversational tone. Make it feel natural and approachable while preserving the key information.",
        "Convert to casual tone",
        false
    });
    
    // Extract action items
    m_promptTemplates.append({
        "actions",
        "Extract Actions",
        "☑️",
        "Extract all action items, tasks, and to-dos from this text. Format as a clear checklist with each item starting with '[ ]'. Include any deadlines or assignees mentioned.",
        "Extract actionable tasks",
        false
    });
    
    // Questions
    m_promptTemplates.append({
        "questions",
        "Generate Questions",
        "❓",
        "Generate thoughtful questions about this text that would help deepen understanding or spark discussion. Include a mix of clarifying, analytical, and open-ended questions.",
        "Generate discussion questions",
        false
    });
    
    // Custom prompt placeholder
    m_promptTemplates.append({
        "custom",
        "Custom Prompt",
        "💬",
        "",  // User will provide
        "Enter your own instructions",
        false
    });
}

void AIConfig::setConfigDirectory(const QString &path)
{
    m_configDirectory = path;
    loadConfig();
}

QString AIConfig::configDirectory() const
{
    return m_configDirectory;
}

QString AIConfig::configFilePath() const
{
    return m_configDirectory + "/ai-config.json";
}

AIProvider AIConfig::currentProvider() const
{
    return m_currentProvider;
}

QString AIConfig::currentProviderName() const
{
    switch (m_currentProvider) {
        case AIProvider::OpenAI: return "openai";
        case AIProvider::Anthropic: return "anthropic";
        case AIProvider::Ollama: return "ollama";
        default: return "none";
    }
}

void AIConfig::setCurrentProvider(AIProvider provider)
{
    if (m_currentProvider != provider) {
        m_currentProvider = provider;
        emit configChanged();
        saveConfig();
    }
}

void AIConfig::setCurrentProviderByName(const QString &name)
{
    QString lower = name.toLower();
    if (lower == "openai") {
        setCurrentProvider(AIProvider::OpenAI);
    } else if (lower == "anthropic") {
        setCurrentProvider(AIProvider::Anthropic);
    } else if (lower == "ollama") {
        setCurrentProvider(AIProvider::Ollama);
    } else {
        setCurrentProvider(AIProvider::None);
    }
}

QString AIConfig::apiKey(AIProvider provider) const
{
    switch (provider) {
        case AIProvider::OpenAI: return m_openaiKey;
        case AIProvider::Anthropic: return m_anthropicKey;
        default: return QString();
    }
}

void AIConfig::setApiKey(AIProvider provider, const QString &key)
{
    switch (provider) {
        case AIProvider::OpenAI:
            if (m_openaiKey != key) {
                m_openaiKey = key;
                emit configChanged();
                saveConfig();
            }
            break;
        case AIProvider::Anthropic:
            if (m_anthropicKey != key) {
                m_anthropicKey = key;
                emit configChanged();
                saveConfig();
            }
            break;
        default:
            break;
    }
}

void AIConfig::setOpenAIKey(const QString &key)
{
    setApiKey(AIProvider::OpenAI, key);
}

void AIConfig::setAnthropicKey(const QString &key)
{
    setApiKey(AIProvider::Anthropic, key);
}

QString AIConfig::ollamaUrl() const
{
    return m_ollamaUrl;
}

void AIConfig::setOllamaUrl(const QString &url)
{
    if (m_ollamaUrl != url) {
        m_ollamaUrl = url;
        emit configChanged();
        saveConfig();
    }
}

QString AIConfig::ollamaModel() const
{
    return m_ollamaModel;
}

void AIConfig::setOllamaModel(const QString &model)
{
    if (m_ollamaModel != model) {
        m_ollamaModel = model;
        emit configChanged();
        saveConfig();
    }
}

QString AIConfig::openaiModel() const
{
    return m_openaiModel;
}

void AIConfig::setOpenaiModel(const QString &model)
{
    if (m_openaiModel != model) {
        m_openaiModel = model;
        emit configChanged();
        saveConfig();
    }
}

QString AIConfig::anthropicModel() const
{
    return m_anthropicModel;
}

void AIConfig::setAnthropicModel(const QString &model)
{
    if (m_anthropicModel != model) {
        m_anthropicModel = model;
        emit configChanged();
        saveConfig();
    }
}

bool AIConfig::isConfigured() const
{
    switch (m_currentProvider) {
        case AIProvider::OpenAI:
            return !m_openaiKey.isEmpty();
        case AIProvider::Anthropic:
            return !m_anthropicKey.isEmpty();
        case AIProvider::Ollama:
            return !m_ollamaUrl.isEmpty() && !m_ollamaModel.isEmpty();
        default:
            return false;
    }
}

bool AIConfig::hasApiKey(AIProvider provider) const
{
    return !apiKey(provider).isEmpty();
}

QList<PromptTemplate> AIConfig::promptTemplates() const
{
    QList<PromptTemplate> all = m_promptTemplates;
    all.append(m_customPrompts);
    return all;
}

QVariantList AIConfig::promptTemplatesVariant() const
{
    QVariantList list;
    for (const auto &pt : promptTemplates()) {
        list.append(pt.toVariantMap());
    }
    return list;
}

void AIConfig::addCustomPrompt(const PromptTemplate &prompt)
{
    m_customPrompts.append(prompt);
    emit configChanged();
    saveConfig();
}

void AIConfig::removeCustomPrompt(const QString &id)
{
    for (int i = 0; i < m_customPrompts.size(); ++i) {
        if (m_customPrompts[i].id == id) {
            m_customPrompts.removeAt(i);
            emit configChanged();
            saveConfig();
            return;
        }
    }
}

QString AIConfig::getProviderDisplayName(const QString &provider) const
{
    if (provider == "openai") return "OpenAI";
    if (provider == "anthropic") return "Anthropic (Claude)";
    if (provider == "ollama") return "Ollama (Local)";
    return "Not Configured";
}

QStringList AIConfig::availableProviders() const
{
    return {"openai", "anthropic", "ollama"};
}

bool AIConfig::loadConfig()
{
    QString path = configFilePath();
    QFile file(path);
    
    if (!file.exists()) {
        qDebug() << "AI config file does not exist yet:" << path;
        return true;  // Not an error, just no config yet
    }
    
    if (!file.open(QIODevice::ReadOnly)) {
        emit errorOccurred(tr("Could not open AI config file"));
        return false;
    }
    
    QByteArray data = file.readAll();
    file.close();
    
    QJsonParseError error;
    QJsonDocument doc = QJsonDocument::fromJson(data, &error);
    
    if (error.error != QJsonParseError::NoError) {
        emit errorOccurred(tr("Invalid AI config file: %1").arg(error.errorString()));
        return false;
    }
    
    QJsonObject root = doc.object();
    
    // Load provider
    setCurrentProviderByName(root["provider"].toString());
    
    // Load API keys
    m_openaiKey = root["openaiKey"].toString();
    m_anthropicKey = root["anthropicKey"].toString();
    
    // Load provider settings
    m_ollamaUrl = root["ollamaUrl"].toString(DEFAULT_OLLAMA_URL);
    m_ollamaModel = root["ollamaModel"].toString(DEFAULT_OLLAMA_MODEL);
    m_openaiModel = root["openaiModel"].toString(DEFAULT_OPENAI_MODEL);
    m_anthropicModel = root["anthropicModel"].toString(DEFAULT_ANTHROPIC_MODEL);
    
    // Load custom prompts
    m_customPrompts.clear();
    QJsonArray customPrompts = root["customPrompts"].toArray();
    for (const auto &val : customPrompts) {
        QJsonObject obj = val.toObject();
        PromptTemplate pt;
        pt.id = obj["id"].toString();
        pt.name = obj["name"].toString();
        pt.icon = obj["icon"].toString();
        pt.prompt = obj["prompt"].toString();
        pt.description = obj["description"].toString();
        pt.expectsMermaid = obj["expectsMermaid"].toBool();
        m_customPrompts.append(pt);
    }
    
    emit configLoaded();
    emit configChanged();
    return true;
}

bool AIConfig::saveConfig()
{
    if (m_configDirectory.isEmpty()) {
        return false;
    }
    
    // Ensure directory exists
    QDir dir(m_configDirectory);
    if (!dir.exists()) {
        dir.mkpath(".");
    }
    
    QJsonObject root;
    root["provider"] = currentProviderName();
    root["openaiKey"] = m_openaiKey;
    root["anthropicKey"] = m_anthropicKey;
    root["ollamaUrl"] = m_ollamaUrl;
    root["ollamaModel"] = m_ollamaModel;
    root["openaiModel"] = m_openaiModel;
    root["anthropicModel"] = m_anthropicModel;
    
    // Save custom prompts
    QJsonArray customPrompts;
    for (const auto &pt : m_customPrompts) {
        QJsonObject obj;
        obj["id"] = pt.id;
        obj["name"] = pt.name;
        obj["icon"] = pt.icon;
        obj["prompt"] = pt.prompt;
        obj["description"] = pt.description;
        obj["expectsMermaid"] = pt.expectsMermaid;
        customPrompts.append(obj);
    }
    root["customPrompts"] = customPrompts;
    
    QJsonDocument doc(root);
    
    QString path = configFilePath();
    QFile file(path);
    
    if (!file.open(QIODevice::WriteOnly)) {
        emit errorOccurred(tr("Could not save AI config file"));
        return false;
    }
    
    file.write(doc.toJson(QJsonDocument::Indented));
    file.close();
    
    emit configSaved();
    return true;
}

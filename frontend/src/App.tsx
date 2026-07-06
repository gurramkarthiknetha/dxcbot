import { useState, useEffect, useRef } from 'react';
import './App.css';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  buttons?: string[];
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const apiHost = import.meta.env.VITE_API_URL || 'http://localhost:6262';

  // Apply dark class to documentElement
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark-theme');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  // Scroll to bottom whenever messages or loading state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMsg: Message = {
      id: Math.random().toString(36).substr(2, 9),
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Keep track of the updated messages array to include in history (excluding the bot loading slot)
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      // Map history to the format expected by backend (sender, text)
      const history = messages.map(msg => ({
        sender: msg.sender,
        text: msg.text
      }));

      const res = await fetch(`${apiHost}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: textToSend,
          history: history 
        }),
      });

      if (!res.ok) {
        throw new Error('Could not connect to the assistant backend.');
      }

      const data = await res.json();
      
      const botMsg: Message = {
        id: Math.random().toString(36).substr(2, 9),
        sender: 'bot',
        text: data.reply || "I couldn't find that information in the LBL documentation. Please contact the LBL Service Center for further assistance.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        buttons: data.buttons || [],
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (error) {
      console.error(error);
      const errorMsg: Message = {
        id: Math.random().toString(36).substr(2, 9),
        sender: 'bot',
        text: "I experienced an error connecting to the LBL Support Assistant service. Please verify the API server is running or contact the LBL Service Center.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        buttons: [],
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(input);
  };

  const handleQuickAction = (question: string) => {
    handleSendMessage(question);
  };

  const handleButtonClick = (buttonText: string, messageId: string) => {
    // Send message simulating user click
    handleSendMessage(buttonText);
    
    // Clear/hide buttons from that message bubble so user cannot re-click them in history
    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, buttons: [] } : msg))
    );
  };

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  // Helper to parse line breaks, lists, bold elements, and code block tags
  const parseMessageText = (text: string) => {
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Handle bold text **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    const lines = html.split('\n');
    const output: string[] = [];
    let inList = false;
    let listType: 'ul' | 'ol' | null = null;
    let inCode = false;
    let codeLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Code Block parsing
      if (line.startsWith('```')) {
        if (inCode) {
          output.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
          codeLines = [];
          inCode = false;
        } else {
          inCode = true;
        }
        continue;
      }

      if (inCode) {
        codeLines.push(lines[i]);
        continue;
      }

      // Match lists
      const ulMatch = line.match(/^[\-\*•]\s+(.*)/);
      const olMatch = line.match(/^(\d+)\.\s+(.*)/);

      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
          output.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        output.push(`<li>${ulMatch[1]}</li>`);
      } else if (olMatch) {
        if (!inList || listType !== 'ol') {
          if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
          output.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        output.push(`<li>${olMatch[2]}</li>`);
      } else {
        if (inList) {
          output.push(listType === 'ul' ? '</ul>' : '</ol>');
          inList = false;
          listType = null;
        }
        if (line) {
          output.push(`<p>${line}</p>`);
        } else {
          output.push('<div class="spacer" style="height: 8px;"></div>');
        }
      }
    }

    if (inList) {
      output.push(listType === 'ul' ? '</ul>' : '</ol>');
    }

    return output.join('\n');
  };

  return (
    <div className="app-layout">
      {/* Sidebar Panel */}
      <aside className="sidebar" id="sidebar-menu">
        <div className="brand">
          <div className="brand-icon">L</div>
          <div className="brand-text">
            <h2>LBL Assistant</h2>
            <p>Customer Support Bot</p>
          </div>
        </div>

        <div className="quick-actions-section">
          <span className="section-title">Common Topics</span>
          <button 
            type="button" 
            id="qa-register"
            className="quick-action-btn"
            onClick={() => handleQuickAction("How do I register?")}
          >
            How do I register?
          </button>
          <button 
            type="button" 
            id="qa-password"
            className="quick-action-btn"
            onClick={() => handleQuickAction("What are the password requirements?")}
          >
            Password Requirements
          </button>
          <button 
            type="button" 
            id="qa-mfa"
            className="quick-action-btn"
            onClick={() => handleQuickAction("Why am I not receiving my verification code?")}
          >
            Verification Code Issues
          </button>
          <button 
            type="button" 
            id="qa-timeout"
            className="quick-action-btn"
            onClick={() => handleQuickAction("What is the user session timeout?")}
          >
            Session Timeout
          </button>
          <button 
            type="button" 
            id="qa-outage"
            className="quick-action-btn"
            onClick={() => handleQuickAction("How do I report a system outage?")}
          >
            Reporting an Outage
          </button>
        </div>

        <div className="resources-card">
          <h4>Need further help?</h4>
          <p>If the chatbot cannot resolve your issue, please contact the LBL Service Center.</p>
          <a href="tel:1-844-768-6777">Call Service Center</a>
        </div>
      </aside>

      {/* Main Chat Window */}
      <main className="chat-container">
        <header className="chat-header">
          <div className="chat-status">
            <div className="mobile-brand-icon">L</div>
            <span className="status-dot"></span>
            <span className="status-text">LBL Support Agent Online</span>
          </div>

          <button 
            type="button"
            className="theme-toggle-btn"
            id="theme-toggler"
            onClick={toggleTheme}
            aria-label="Toggle light/dark theme"
          >
            {isDark ? (
              <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" width="20" height="20">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            ) : (
              <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" width="20" height="20">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
              </svg>
            )}
          </button>
        </header>

        {/* Message Log */}
        <section className="messages-history">
          {messages.length === 0 ? (
            <div className="welcome-container">
              <div className="welcome-logo">L</div>
              <h3>Welcome to LBL Portal Support</h3>
              <p>
                I am your documentation-based AI assistant. To help me guide you to the right documentation, please select your role below:
              </p>
              
              <div className="welcome-suggestions" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div 
                  className="suggestion-card"
                  onClick={() => handleQuickAction("Agent")}
                >
                  <h5>Agent / Producer</h5>
                  <p>Access the Agent Portal and client books.</p>
                </div>
                <div 
                  className="suggestion-card"
                  onClick={() => handleQuickAction("Owner")}
                >
                  <h5>Policy Owner</h5>
                  <p>Access Owner Portal and link policies.</p>
                </div>
                <div 
                  className="suggestion-card"
                  onClick={() => handleQuickAction("Home Office")}
                >
                  <h5>Home Office</h5>
                  <p>Access internal admin help & support tools.</p>
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`message-wrapper ${msg.sender}`}>
                <div 
                  className="message-bubble"
                  dangerouslySetInnerHTML={{ __html: parseMessageText(msg.text) }}
                />
                
                {/* Render Selection Option Buttons under bot response bubbles */}
                {msg.sender === 'bot' && msg.buttons && msg.buttons.length > 0 && (
                  <div className="message-action-buttons">
                    {msg.buttons.map((btnText, index) => (
                      <button
                        key={`${msg.id}-btn-${index}`}
                        type="button"
                        className="choice-action-btn"
                        onClick={() => handleButtonClick(btnText, msg.id)}
                      >
                        {btnText}
                      </button>
                    ))}
                  </div>
                )}

                <span className="message-meta">
                  {msg.sender === 'bot' ? 'Assistant' : 'You'} • {msg.timestamp}
                </span>
              </div>
            ))
          )}

          {isLoading && (
            <div className="message-wrapper bot">
              <div className="message-bubble">
                <div className="typing-indicator">
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
              </div>
              <span className="message-meta">Assistant is typing...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </section>

        {/* Input Footer */}
        <footer className="input-area">
          <form onSubmit={handleFormSubmit} className="input-form">
            <input
              type="text"
              id="chat-input-field"
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about the LBL Portal..."
              disabled={isLoading}
              autoComplete="off"
            />
            <button 
              type="submit" 
              className="send-btn" 
              id="send-message-btn"
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
            >
              <svg viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </form>
          <div className="input-footer-text">
            Answers are strictly generated based on official Lincoln Benefit Life portal documentation.
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;

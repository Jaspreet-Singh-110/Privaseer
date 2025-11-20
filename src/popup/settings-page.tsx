import React, { useState } from 'react';
import { X, MessageSquare, Send, Info, Palette, Mail, ChevronRight, ArrowLeft } from 'lucide-react';
import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';

type SettingsSection = 'menu' | 'feedback' | 'theme' | 'burner-services';

interface SettingsPageProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: chrome.tabs.Tab | null;
  onFeedbackSuccess: () => void;
}

export function SettingsPage({ isOpen, onClose, currentTab, onFeedbackSuccess }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('menu');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const getDomain = (url?: string): string => {
        if (!url) return 'unknown';
        try {
          return new URL(url).hostname;
        } catch {
          return 'unknown';
        }
      };

      const response = await chrome.runtime.sendMessage({
        type: 'SUBMIT_FEEDBACK',
        data: {
          feedbackText,
          url: currentTab?.url || 'unknown',
          domain: getDomain(currentTab?.url),
        },
      });

      if (response.success) {
        logger.info('Popup', 'User feedback submitted', { domain: getDomain(currentTab?.url) });
        setFeedbackText('');
        onClose();
        onFeedbackSuccess();
      } else {
        logger.error('Popup', 'Failed to submit feedback', new Error(response.error || 'Unknown error'));
      }
    } catch (error) {
      logger.error('Popup', 'Failed to submit feedback', toError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md transform transition-all animate-fade-in">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {activeSection !== 'menu' && (
              <button
                onClick={() => setActiveSection('menu')}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-gray-900">
              {activeSection === 'menu' && 'Settings'}
              {activeSection === 'feedback' && 'Feedback'}
              {activeSection === 'theme' && 'Theme'}
              {activeSection === 'burner-services' && 'Burner Email Services'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 max-h-96 overflow-y-auto">
          {activeSection === 'menu' && (
            <div className="space-y-3">
              <button
                onClick={() => setActiveSection('theme')}
                className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                    <Palette className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-gray-900">Theme</h3>
                    <p className="text-xs text-gray-600">Customize appearance</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
              </button>

              <button
                onClick={() => setActiveSection('feedback')}
                className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                    <MessageSquare className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-gray-900">Feedback</h3>
                    <p className="text-xs text-gray-600">Share your thoughts</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
              </button>

              <button
                onClick={() => setActiveSection('burner-services')}
                className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                    <Mail className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-gray-900">Burner Email Services</h3>
                    <p className="text-xs text-gray-600">Manage email settings</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
              </button>

              <button
                onClick={() => setActiveSection('menu')}
                className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                    <Info className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-gray-900">About</h3>
                    <p className="text-xs text-gray-600">App information</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
              </button>
            </div>
          )}

          {activeSection === 'feedback' && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Help us improve Privaseer. Share your thoughts, report issues, or suggest features.
              </p>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Type your feedback here..."
                className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm transition-all"
              />
              <button
                onClick={handleFeedbackSubmit}
                disabled={!feedbackText.trim() || isSubmitting}
                className="mt-3 w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-xl">
          <button
            onClick={activeSection === 'menu' ? onClose : () => setActiveSection('menu')}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {activeSection === 'menu' ? 'Close' : 'Back'}
          </button>
        </div>
      </div>
    </div>
  );
}

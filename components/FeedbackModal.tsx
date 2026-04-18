import React, { useState, useRef } from 'react';
import { db, storage } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

type FeedbackType = 'bug' | 'suggestion' | 'question' | 'praise';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage: string;
}

const TYPE_CONFIG: Record<FeedbackType, { label: string; icon: string; activeClass: string }> = {
  bug:        { label: 'Bug',        icon: 'fa-bug',             activeClass: 'bg-brand-rose text-white border-brand-rose' },
  suggestion: { label: 'Suggestion', icon: 'fa-lightbulb',       activeClass: 'bg-amber-500 text-white border-amber-500' },
  question:   { label: 'Question',   icon: 'fa-circle-question', activeClass: 'bg-brand-blue text-white border-brand-blue' },
  praise:     { label: 'Praise',     icon: 'fa-star',            activeClass: 'bg-emerald-500 text-white border-emerald-500' },
};

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, currentPage }) => {
  const [type, setType]                         = useState<FeedbackType>('suggestion');
  const [message, setMessage]                   = useState('');
  const [email, setEmail]                       = useState('');
  const [screenshot, setScreenshot]             = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting]             = useState(false);
  const [submitted, setSubmitted]               = useState(false);
  const [error, setError]                       = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshot(file);
    const reader = new FileReader();
    reader.onloadend = () => setScreenshotPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    setError('');

    try {
      let screenshotUrl: string | undefined;

      if (screenshot) {
        const id = crypto.randomUUID();
        const ext = screenshot.name.split('.').pop() || 'png';
        const sRef = storageRef(storage, `feedback/${id}/screenshot.${ext}`);
        await uploadBytes(sRef, screenshot);
        screenshotUrl = await getDownloadURL(sRef);
      }

      await addDoc(collection(db, 'feedback'), {
        type,
        message:   message.trim(),
        ...(email.trim()    && { email: email.trim() }),
        ...(screenshotUrl   && { screenshotUrl }),
        page:      currentPage,
        userAgent: navigator.userAgent,
        createdAt: serverTimestamp(),
      });

      setSubmitted(true);
    } catch (err) {
      console.error('Feedback submission error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setType('suggestion');
    setMessage('');
    setEmail('');
    setScreenshot(null);
    setScreenshotPreview(null);
    setSubmitted(false);
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-brand-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-brand-black/10 overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-brand-black/5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-brand-black">Send Feedback</h2>
            <p className="text-xs text-brand-gray/60 mt-0.5">Help us improve PhotoVise</p>
          </div>
          <button
            onClick={handleClose}
            className="text-brand-gray/40 hover:text-brand-rose transition-colors"
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Success state */}
        {submitted ? (
          <div className="px-6 py-14 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <i className="fa-solid fa-check text-emerald-500 text-lg"></i>
            </div>
            <h3 className="text-sm font-semibold text-brand-black mb-1">Thanks for your feedback!</h3>
            <p className="text-xs text-brand-gray/60 mb-6">
              We read every submission and use it to make PhotoVise better.
            </p>
            <button
              onClick={handleClose}
              className="text-xs font-medium text-brand-blue hover:underline"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

            {/* Type selector */}
            <div>
              <p className="text-xs font-medium text-brand-black/50 mb-2">Type</p>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(TYPE_CONFIG) as [FeedbackType, typeof TYPE_CONFIG[FeedbackType]][]).map(([val, cfg]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setType(val)}
                    className={`flex flex-col items-center gap-1.5 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                      type === val
                        ? cfg.activeClass
                        : 'bg-white text-brand-gray border-brand-black/10 hover:border-brand-black/20'
                    }`}
                  >
                    <i className={`fa-solid ${cfg.icon} text-sm`}></i>
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="text-xs font-medium text-brand-black/50 block mb-2">
                Message <span className="text-brand-rose">*</span>
              </label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Describe the issue, idea, or question…"
                className="w-full resize-none rounded-lg border border-brand-black/10 bg-brand-white px-4 py-3 text-sm text-brand-black placeholder:text-brand-gray/30 focus:outline-none focus:ring-1 focus:ring-brand-blue transition-all"
              />
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-medium text-brand-black/50 block mb-2">
                Email <span className="text-brand-gray/30">(optional — if you'd like a reply)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full rounded-lg border border-brand-black/10 bg-brand-white px-4 py-2.5 text-sm text-brand-black placeholder:text-brand-gray/30 focus:outline-none focus:ring-1 focus:ring-brand-blue transition-all"
              />
            </div>

            {/* Screenshot */}
            <div>
              <p className="text-xs font-medium text-brand-black/50 mb-2">
                Screenshot <span className="text-brand-gray/30">(optional)</span>
              </p>
              {screenshotPreview ? (
                <div className="relative rounded-lg overflow-hidden border border-brand-black/10">
                  <img
                    src={screenshotPreview}
                    alt="Screenshot preview"
                    className="w-full h-32 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => { setScreenshot(null); setScreenshotPreview(null); }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-brand-black/60 text-white flex items-center justify-center hover:bg-brand-rose transition-colors"
                    aria-label="Remove screenshot"
                  >
                    <i className="fa-solid fa-xmark text-[10px]"></i>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border border-dashed border-brand-black/15 rounded-lg py-4 text-xs text-brand-gray/40 hover:border-brand-blue/40 hover:text-brand-blue transition-all flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-image"></i>
                  Attach a screenshot
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-brand-rose flex items-center gap-1.5">
                <i className="fa-solid fa-circle-exclamation"></i>{error}
              </p>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] text-brand-gray/30 font-medium">
                Page: {currentPage}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-xs font-medium text-brand-gray hover:text-brand-black transition-colors px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!message.trim() || submitting}
                  className={`text-xs font-semibold px-5 py-2 rounded-lg transition-all active:scale-95 flex items-center gap-1.5 ${
                    !message.trim() || submitting
                      ? 'bg-brand-black/10 text-brand-gray/40 cursor-not-allowed'
                      : 'bg-brand-black text-white hover:bg-zinc-700 shadow-sm'
                  }`}
                >
                  {submitting
                    ? <><i className="fa-solid fa-circle-notch animate-spin"></i> Sending…</>
                    : 'Send feedback'
                  }
                </button>
              </div>
            </div>

          </form>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;

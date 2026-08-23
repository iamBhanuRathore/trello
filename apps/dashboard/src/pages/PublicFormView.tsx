import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getPublicForm, submitPublicForm } from '../lib/api';
import {
  Send,
  Clock,
  LayoutDashboard,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';

export function PublicFormView() {
  const { slug } = useParams<{ slug: string }>();

  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submissionResult, setSubmissionResult] = useState<any>(null);

  const { data: form, isLoading, error } = useQuery({
    queryKey: ['publicForm', slug],
    queryFn: () => getPublicForm(slug!),
    enabled: !!slug,
  });

  const submitMutation = useMutation({
    mutationFn: (payload: { submittedByName?: string; submittedByEmail?: string; data: Record<string, any> }) =>
      submitPublicForm(slug!, payload),
    onSuccess: (res) => {
      setSubmissionResult(res);
    },
  });

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate({
      submittedByName: requesterName,
      submittedByEmail: requesterEmail,
      data: formData,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading submission portal...</p>
        </div>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4">
        <div className="max-w-md w-full p-8 rounded-3xl border border-slate-800 bg-slate-900/80 backdrop-blur-xl text-center space-y-4 shadow-2xl">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold">Portal Unavailable</h2>
          <p className="text-xs text-slate-400">
            This intake form has been unpublished, closed, or does not exist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-between py-12 px-4 sm:px-6">
      <div className="max-w-xl mx-auto w-full space-y-8">
        {/* Brand Header */}
        <div className="flex items-center justify-center gap-2 text-slate-400">
          <LayoutDashboard className="w-5 h-5 text-primary" />
          <span className="text-sm font-semibold tracking-wider uppercase text-slate-200">
            Boardly Intake Portal
          </span>
        </div>

        {/* Card Form Container */}
        <div className="p-8 sm:p-10 rounded-3xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-2xl shadow-2xl space-y-6">
          {submissionResult ? (
            /* Success Confirmation State */
            <div className="text-center space-y-5 py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-100">Ticket Received!</h2>
                <p className="text-sm text-slate-400 max-w-sm mx-auto">
                  Your request has been filed directly onto the team&apos;s board.
                </p>
              </div>

              {submissionResult.slaDueDate && (
                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 max-w-sm mx-auto flex items-center gap-3 text-left">
                  <Clock className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-emerald-300">Target SLA Resolution</p>
                    <p className="text-[11px] text-slate-400">
                      Expected by {new Date(submissionResult.slaDueDate).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              <Button
                onClick={() => {
                  setSubmissionResult(null);
                  setFormData({});
                  setRequesterName('');
                  setRequesterEmail('');
                }}
                variant="outline"
                className="text-xs mt-4"
              >
                Submit Another Request
              </Button>
            </div>
          ) : (
            /* Active Form Submission */
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Form Title & SLA Banner */}
              <div className="space-y-3 border-b border-slate-800 pb-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                    {form.title}
                  </h1>
                  {form.slaHours && (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      {form.slaHours}h Response SLA
                    </span>
                  )}
                </div>

                {form.description && (
                  <p className="text-xs text-slate-400 leading-relaxed">{form.description}</p>
                )}
              </div>

              {/* Requester Contact Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300">Your Full Name</Label>
                  <Input
                    placeholder="Jane Doe"
                    value={requesterName}
                    onChange={(e) => setRequesterName(e.target.value)}
                    required
                    className="bg-slate-950/60 border-slate-800 text-xs h-10 text-slate-100 placeholder:text-slate-600 focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300">Your Email Address</Label>
                  <Input
                    type="email"
                    placeholder="jane@company.com"
                    value={requesterEmail}
                    onChange={(e) => setRequesterEmail(e.target.value)}
                    required
                    className="bg-slate-950/60 border-slate-800 text-xs h-10 text-slate-100 placeholder:text-slate-600 focus:border-primary"
                  />
                </div>
              </div>

              {/* Dynamic Field Inputs */}
              <div className="space-y-4">
                {form.fields && form.fields.map((field: any) => (
                  <div key={field.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-slate-300">
                        {field.label} {field.required && <span className="text-rose-400">*</span>}
                      </Label>
                    </div>

                    {field.type === 'textarea' ? (
                      <textarea
                        rows={4}
                        placeholder={field.placeholder || 'Provide details...'}
                        value={formData[field.id] || ''}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        required={field.required}
                        className="w-full p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:border-primary outline-none transition-colors"
                      />
                    ) : field.type === 'select' ? (
                      <select
                        value={formData[field.id] || ''}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        required={field.required}
                        className="w-full h-10 rounded-xl bg-slate-950/60 border border-slate-800 text-xs px-3 text-slate-100 focus:border-primary outline-none"
                      >
                        <option value="">Select an option...</option>
                        {field.options?.map((opt: string) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        type={field.type || 'text'}
                        placeholder={field.placeholder || ''}
                        value={formData[field.id] || ''}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        required={field.required}
                        className="bg-slate-950/60 border-slate-800 text-xs h-10 text-slate-100 placeholder:text-slate-600 focus:border-primary"
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Submit Action */}
              <Button
                type="submit"
                disabled={submitMutation.isPending}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs gap-2 rounded-xl shadow-lg transition-all"
              >
                {submitMutation.isPending ? (
                  'Submitting...'
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Submit Request
                  </>
                )}
              </Button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-[11px] text-slate-500 flex items-center justify-center gap-1">
          <HelpCircle className="w-3.5 h-3.5" /> Powered by Boardly Agile Workspace
        </div>
      </div>
    </div>
  );
}

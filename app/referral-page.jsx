'use client';

import { UserButton, useUser } from '@clerk/nextjs';
import { useRef, useState } from 'react';
import { OPENINGS } from '../lib/openings.js';
import { canEditReferralEmail } from '../lib/referral-email.js';

const ICONS = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  close: 'm6 6 12 12M6 18 18 6',
  down: 'm6 9 6 6 6-6',
  file: 'M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 13h8M8 17h5',
  lock: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5V11Zm7 4v2',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
};

function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export default function ReferralPage() {
  const { isLoaded, user } = useUser();
  const accountEmail = user?.primaryEmailAddress?.emailAddress ?? '';
  const emailIsEditable = canEditReferralEmail(accountEmail);
  const [emailDraft, setEmailDraft] = useState(null);
  const referralEmail = emailIsEditable && emailDraft?.accountEmail === accountEmail ? emailDraft.value : accountEmail;
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [resume, setResume] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [jobId, setJobId] = useState('');
  const resumeInput = useRef(null);

  function clearResume() {
    setResume(null);
    setUploadError('');
    if (resumeInput.current) resumeInput.current.value = '';
  }

  function chooseResume(file) {
    if (!file) return;
    if (!/\.(pdf|doc|docx)$/i.test(file.name) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      clearResume();
      setUploadError('Please upload a PDF, DOC, or DOCX file, up to 5 MB.');
      return;
    }
    setResume(file);
    setUploadError('');
  }

  async function submitReferral(event) {
    event.preventDefault();
    if (!resume || submitting || !isLoaded || !referralEmail) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set('resume', resume);
    setSubmitting(true);
    setResult(null);

    try {
      const response = await fetch('/api/referrals', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Could not submit referral.');
      }
      setResult({ success: true, message: 'Referral submitted successfully. Status: ' + body.status + '.' });
      form.reset();
      setEmailDraft(null);
      setJobId('');
      clearResume();
    } catch (error) {
      setResult({ success: false, message: error.message || 'Could not submit referral. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app">
      <a className="skip-link" href="#referral-form">Skip to referral form</a>
      <header className="app-header">
        <div className="header-content">
          <a className="brand" href="/" aria-label="Juspay referrals home">
            <span className="brand-name">juspay</span>
            <span className="brand-divider" />
            <span className="brand-product">Referrals</span>
          </a>
          <div className="account-control">
            <UserButton appearance={{ elements: { avatarBox: 'account-avatar' } }} />
          </div>
        </div>
      </header>

      <main className="page-content">
        <form id="referral-form" className="referral-form" onSubmit={submitReferral} encType="multipart/form-data" aria-labelledby="form-title" aria-busy={submitting}>
          <h1 id="form-title">New referral</h1>

          {isLoaded && !accountEmail && (
            <p className="notice notice-error" role="alert">Add a primary email in your account settings before submitting a referral.</p>
          )}

          <fieldset className="form-fields" disabled={submitting}>
            <legend className="visually-hidden">Referral details</legend>

            <label className="field" htmlFor="referral-name">
              <span>Full name</span>
              <input id="referral-name" name="referralName" autoComplete="name" required maxLength={200} />
            </label>

            <label className="field" htmlFor="graduation-date">
              <span>Graduation date</span>
              <input id="graduation-date" name="graduationDate" type="date" required />
            </label>

            <label className="field field-wide" htmlFor="referral-email">
              <span>Referral email</span>
              <span className="input-with-icon">
                <input
                  id="referral-email"
                  name="referralEmail"
                  type="email"
                  value={referralEmail}
                  onChange={(event) => setEmailDraft({ accountEmail, value: event.target.value })}
                  placeholder={isLoaded ? '' : 'Loading…'}
                  readOnly={!emailIsEditable}
                  required
                  maxLength={320}
                />
                {!emailIsEditable && <Icon name="lock" size={16} />}
              </span>
            </label>

            <label className="field field-wide" htmlFor="job-id">
              <span>Opening</span>
              <span className="select-wrap">
                <select id="job-id" name="jobId" required value={jobId} onChange={(event) => setJobId(event.target.value)}>
                  <option value="" disabled>Select a role</option>
                  {OPENINGS.map(({ id, title, roleType, location }) => (
                    <option key={id} value={id}>{title} · {roleType} · {location}</option>
                  ))}
                </select>
                <Icon name="down" size={16} />
              </span>
            </label>

            <div className="field field-wide">
              <label htmlFor="resume-upload">Resume</label>
              <div
                className={'upload-area' + (dragging ? ' is-dragging' : '') + (resume ? ' has-file' : '') + (uploadError ? ' has-error' : '')}
                onDragOver={(event) => { event.preventDefault(); if (!submitting) setDragging(true); }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
                onDrop={(event) => { event.preventDefault(); setDragging(false); if (!submitting) chooseResume(event.dataTransfer.files[0]); }}
              >
                <input
                  id="resume-upload"
                  className="file-input"
                  name="resume"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  required={!resume}
                  ref={resumeInput}
                  onChange={(event) => chooseResume(event.target.files[0])}
                  aria-describedby={uploadError ? 'upload-error' : undefined}
                  aria-invalid={Boolean(uploadError)}
                />
                <Icon name={resume ? 'file' : 'upload'} size={21} />
                <span className="upload-copy">
                  <span>{resume ? resume.name : 'Upload resume'}</span>
                  {resume && <small>{(resume.size / 1024).toFixed(1)} KB</small>}
                </span>
                {resume && (
                  <button className="remove-file" type="button" aria-label="Remove resume" onClick={clearResume}>
                    <Icon name="close" size={17} />
                  </button>
                )}
              </div>
              {uploadError && <p className="field-error" id="upload-error" role="alert">{uploadError}</p>}
            </div>

            <label className="field field-wide" htmlFor="relationship">
              <span>How do you know them? (Answer from the referrer’s point of view.)</span>
              <textarea id="relationship" name="relationship" required maxLength={2000} rows={2} />
            </label>

            <label className="field field-wide" htmlFor="recommendation">
              <span>Why do you recommend them? (Answer from the referrer’s point of view.)</span>
              <textarea id="recommendation" name="recommendation" required maxLength={4000} rows={3} />
            </label>
          </fieldset>

          <div className="result-region" aria-live="polite" aria-atomic="true">
            {result && (
              <p className={'notice ' + (result.success ? 'notice-success' : 'notice-error')} role={result.success ? 'status' : 'alert'}>{result.message}</p>
            )}
          </div>

          <div className="form-actions">
            <button className="submit-button" type="submit" disabled={submitting || !isLoaded || !referralEmail}>
              {submitting ? <><span className="button-spinner" />Submitting…</> : <>Submit referral<Icon name="arrow" /></>}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

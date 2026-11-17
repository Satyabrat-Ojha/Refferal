import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReferralHandler } from '../lib/referral-handler.js';
import { createReferralRepository } from '../lib/referral-repository.js';
import { referralStatusPayload } from '../lib/referral-status.js';

function validForm() {
  const form = new FormData();
  form.set('referralName', 'Alex Doe');
  form.set('graduationDate', '2027-07-01');
  form.set('jobId', 'DEV-BE02');
  form.set('relationship', 'We worked together.');
  form.set('recommendation', 'Strong engineering judgment.');
  form.set('resume', new File([Buffer.from('%PDF-1.7\nresume content')], 'alex.pdf', { type: 'application/pdf' }));
  return form;
}

function request(form) {
  return new Request('http://localhost:3000/api/referrals', { method: 'POST', body: form });
}

function signedInUser(email = 'Alex@Example.com') {
  return {
    id: 'user_123',
    primaryEmailAddress: email === null ? null : { emailAddress: email },
  };
}

test('requires Clerk authentication before reading or storing the upload', async () => {
  let saved = false;
  const post = createReferralHandler({
    getUser: async () => null,
    saveReferral: async () => { saved = true; },
  });
  const upload = request(validForm());
  const response = await post(upload);
  assert.equal(response.status, 401);
  assert.equal(upload.bodyUsed, false);
  assert.equal(saved, false);
});

test('stores the normalized Clerk email and base64 resume without a client email or Clerk user ID', async () => {
  let saved;
  const post = createReferralHandler({
    getUser: async () => signedInUser(),
    saveReferral: async (referral) => {
      saved = referral;
      return {
        referralEmail: referral.referralEmail,
        jobId: referral.jobId,
        referralRole: referral.referralRole,
        referralRoleType: referral.referralRoleType,
        status: 'pending',
        createdAt: new Date('2026-09-29T00:00:00.000Z'),
      };
    },
  });

  const form = validForm();
  form.set('referralRole', 'Spoofed role');
  form.set('referralRoleType', 'Full-Time');
  const response = await post(request(form));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    referralEmail: 'alex@example.com',
    jobId: 'DEV-BE02',
    referralRole: 'Software Development Engineer Backend',
    referralRoleType: 'Intern',
    status: 'pending',
    createdAt: '2026-09-29T00:00:00.000Z',
  });
  assert.equal('clerkUserId' in saved, false);
  assert.equal(saved.referralName, 'Alex Doe');
  assert.equal(saved.graduationDate, 'Thu Jul 01 2027 00:00:00 GMT+0530 (India Standard Time)');
  assert.equal(saved.referralEmail, 'alex@example.com');
  assert.equal(saved.jobId, 'DEV-BE02');
  assert.equal(saved.referralRole, 'Software Development Engineer Backend');
  assert.equal(saved.referralRoleType, 'Intern');
  assert.equal(saved.relationship, 'We worked together.');
  assert.equal(saved.recommendation, 'Strong engineering judgment.');
  assert.equal(saved.resumeFilename, 'alex.pdf');
  assert.equal(saved.resumeMimeType, 'application/pdf');
  assert.equal(Buffer.from(saved.resumeBase64, 'base64').toString(), '%PDF-1.7\nresume content');
});

test('ignores a client-supplied referral email and saves the Clerk account email', async () => {
  let saved;
  const post = createReferralHandler({
    getUser: async () => signedInUser(),
    saveReferral: async (referral) => {
      saved = referral;
      return { ...referral, status: 'pending', createdAt: new Date() };
    },
  });
  const form = validForm();
  form.set('referralEmail', 'someone-else@example.com');
  const response = await post(request(form));
  assert.equal(response.status, 201);
  assert.equal(saved.referralEmail, 'alex@example.com');
  assert.equal((await response.json()).referralEmail, 'alex@example.com');
});

test('lets Juspay accounts submit any valid referral email and normalizes it', async () => {
  for (const { accountEmail, enteredEmail, expectedEmail } of [
    { accountEmail: 'employee@juspay.in', enteredEmail: ' Candidate@Example.com ', expectedEmail: 'candidate@example.com' },
    { accountEmail: ' Employee@JUSPAY.IN ', enteredEmail: 'another@juspay.in', expectedEmail: 'another@juspay.in' },
  ]) {
    let saved;
    const post = createReferralHandler({
      getUser: async () => signedInUser(accountEmail),
      saveReferral: async (referral) => {
        saved = referral;
        return { ...referral, status: 'pending', createdAt: new Date() };
      },
    });
    const form = validForm();
    form.set('referralEmail', enteredEmail);
    const response = await post(request(form));
    assert.equal(response.status, 201);
    assert.equal(saved.referralEmail, expectedEmail);
    assert.equal((await response.json()).referralEmail, expectedEmail);
  }
});

test('keeps the account email for Juspay accounts when no referral email is supplied', async () => {
  let saved;
  const post = createReferralHandler({
    getUser: async () => signedInUser('employee@juspay.in'),
    saveReferral: async (referral) => {
      saved = referral;
      return { ...referral, status: 'pending', createdAt: new Date() };
    },
  });
  const response = await post(request(validForm()));
  assert.equal(response.status, 201);
  assert.equal(saved.referralEmail, 'employee@juspay.in');
});

test('rejects invalid referral emails supplied by Juspay accounts before saving', async () => {
  let saves = 0;
  const post = createReferralHandler({
    getUser: async () => signedInUser('employee@juspay.in'),
    saveReferral: async () => { saves++; },
  });
  for (const email of ['', '   ', 'not-an-email', 'a@@example.com', 'x'.repeat(321) + '@example.com', new File(['email'], 'email.txt')]) {
    const form = validForm();
    form.set('referralEmail', email);
    const response = await post(request(form));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /referralEmail.*valid email/);
  }
  assert.equal(saves, 0);
});

test('keeps emails locked for lookalike domains regardless of client-supplied permissions', async () => {
  for (const accountEmail of ['employee@notjuspay.in', 'employee@team.juspay.in', 'employee@juspay.in.evil', 'juspay.in@example.com']) {
    let saved;
    const post = createReferralHandler({
      getUser: async () => signedInUser(accountEmail),
      saveReferral: async (referral) => {
        saved = referral;
        return { ...referral, status: 'pending', createdAt: new Date() };
      },
    });
    const form = validForm();
    form.set('referralEmail', 'candidate@example.com');
    form.set('accountEmail', 'employee@juspay.in');
    form.set('emailIsEditable', 'true');
    const response = await post(request(form));
    assert.equal(response.status, 201);
    assert.equal(saved.referralEmail, accountEmail);
  }
});

test('rejects accounts without a valid primary email before reading or storing the upload', async () => {
  let saves = 0;
  for (const email of [null, '', 'invalid-email']) {
    const post = createReferralHandler({
      getUser: async () => signedInUser(email),
      saveReferral: async () => { saves++; },
    });
    const upload = request(validForm());
    const response = await post(upload);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /primary email/);
    assert.equal(upload.bodyUsed, false);
  }
  assert.equal(saves, 0);
});

test('does not read or save the upload when the Clerk account lookup fails', async () => {
  let saved = false;
  const post = createReferralHandler({
    getUser: async () => { throw new Error('Account lookup unavailable'); },
    saveReferral: async () => { saved = true; },
  });
  const upload = request(validForm());
  const response = await post(upload);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /verify your account/);
  assert.equal(upload.bodyUsed, false);
  assert.equal(saved, false);
});

test('rejects invalid dates and mismatched files before persistence', async () => {
  let saves = 0;
  const post = createReferralHandler({
    getUser: async () => signedInUser(),
    saveReferral: async () => { saves++; },
  });

  const invalidDate = validForm();
  invalidDate.set('graduationDate', '2023-02-29');
  assert.equal((await post(request(invalidDate))).status, 400);

  const invalidFile = validForm();
  invalidFile.set('resume', new File(['not a PDF'], 'fake.pdf', { type: 'application/pdf' }));
  assert.equal((await post(request(invalidFile))).status, 400);

  const invalidOpening = validForm();
  invalidOpening.set('jobId', 'APRD01');
  const invalidOpeningResponse = await post(request(invalidOpening));
  assert.equal(invalidOpeningResponse.status, 400);
  assert.match((await invalidOpeningResponse.json()).error, /jobId.*Engineering job ID/);
  assert.equal(saves, 0);
});

test('maps referral fields into the Prisma create call', async () => {
  let createArgs;
  const db = { referral: { create: async (args) => { createArgs = args; return { referralEmail: 'alex@example.com', jobId: 'DEV-BE02', referralRole: 'Software Development Engineer Backend', referralRoleType: 'Intern', status: 'pending', createdAt: new Date() }; } } };
  const saveReferral = createReferralRepository(() => db);
  await saveReferral({
    referralName: 'Alex Doe', graduationDate: 'Thu Jul 01 2027 00:00:00 GMT+0530 (India Standard Time)',
    referralEmail: 'alex@example.com', jobId: 'DEV-BE02',
    referralRole: 'Software Development Engineer Backend', referralRoleType: 'Intern',
    relationship: 'Colleague', recommendation: 'Strong fit',
    resumeFilename: 'alex.pdf', resumeMimeType: 'application/pdf', resumeBase64: 'JVBERi0=',
  });

  assert.equal('clerkUserId' in createArgs.data, false);
  assert.equal(createArgs.data.graduationDate, 'Thu Jul 01 2027 00:00:00 GMT+0530 (India Standard Time)');
  assert.equal(createArgs.data.jobId, 'DEV-BE02');
  assert.equal(createArgs.data.referralRole, 'Software Development Engineer Backend');
  assert.equal(createArgs.data.referralRoleType, 'Intern');
  assert.equal('opening' in createArgs.data, false);
  assert.equal(createArgs.data.resumeBase64, 'JVBERi0=');
  assert.deepEqual(createArgs.select, { referralEmail: true, jobId: true, referralRole: true, referralRoleType: true, status: true, createdAt: true });
});

test('returns a conflict for an already referred email', async () => {
  const post = createReferralHandler({
    getUser: async () => signedInUser(),
    saveReferral: async () => { throw { code: 'P2002' }; },
  });
  const response = await post(request(validForm()));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /already exists/);
});

test('failure status includes the required LinkedIn message', () => {
  assert.deepEqual(referralStatusPayload({ referralEmail: 'alex@example.com', status: 'failure' }), {
    referralEmail: 'alex@example.com',
    status: 'failure',
    message: 'Applied through LinkedIn',
  });
});

import { randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { requiredSetting } from './mobileSessionInit.js';
import { requiredUserCreationSetting, userCreationSetting } from './userCreation.js';

const firstNames = ['James', 'Daniel', 'Oliver', 'Ethan', 'Noah', 'Lucas', 'Adam', 'Thomas'];
const femaleFirstNames = ['Emma', 'Olivia', 'Sophia', 'Amelia', 'Charlotte', 'Isabella', 'Mia', 'Emily'];
const surnames = ['Smith', 'Taylor', 'Brown', 'Wilson', 'Walker', 'Hall', 'Young', 'Clark'];

export interface EnrolledUser {
  carrierPartyId: number;
  partyId: number;
  insurerCode: string;
  vitalityMembershipId: number;
  firstName: string;
  familyName: string;
  email: string;
  userName: string;
  bornOn: string;
  membershipReference: string;
  externalMembershipId: string;
  response: unknown;
}

export function getRandomFirstName(): string {
  return firstNames[randomInt(firstNames.length)];
}

export function getCurrentDateTime(): string {
  const utcPlusTwo = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return `${utcPlusTwo.toISOString().slice(0, 19)}.000+02:00`;
}

export async function createPartyCore(): Promise<number> {
  const profilePrefix = getProfilePrefix();
  const zuulUrl = requiredUserCreationSetting(`${profilePrefix}ZUUL_URL`).replace(/\/+$/, '');
  const tenant = requiredUserCreationSetting(`${profilePrefix}TENANT_NUMBER`);
  const createPartyCoreUrl = `${zuulUrl}/party-core-management/svc/${tenant}/createPartyCore/1`;

  const response = await fetch(createPartyCoreUrl, { method: 'POST' });
  if (response.status !== 201) {
    throw new Error(`Create-party-core request expected HTTP 201 but received HTTP ${response.status}.`);
  }

  const body: unknown = await response.json();
  const responseBody = asRecord(body)?.createPartyCoreResponse;
  const carrierID = asRecord(responseBody)?.party;
  const CarrierpartyId = asRecord(carrierID)?.partyId;
  if (typeof CarrierpartyId !== 'number' || !Number.isFinite(CarrierpartyId)) {
    throw new Error('Create-party-core response was missing a valid party ID.');
  }
  return CarrierpartyId;
}

export async function enrolUser(carrierPartyId: number): Promise<EnrolledUser> {
  if (!Number.isSafeInteger(carrierPartyId) || carrierPartyId <= 0) {
    throw new Error('User enrolment requires a positive integer carrier party ID.');
  }
  const profilePrefix = getProfilePrefix();
  const baseUrl = requiredUserCreationSetting(`${profilePrefix}INTEGRATION_PLATFORM_BASE_URL`).replace(/\/+$/, '');
  const tenant = requiredUserCreationSetting(`${profilePrefix}TENANT_NUMBER`);
  const token = requiredUserCreationSetting(`${profilePrefix}API_BEARER_TOKEN`).replace(/^Bearer\s+/i, '');
  if (!token || token === '******') {
    throw new Error(`Provide a valid ${profilePrefix}API_BEARER_TOKEN before enrolling a user.`);
  }
  const userAgent = requiredUserCreationSetting('configUserAgent');
  const productKey = requiredUserCreationSetting(`${profilePrefix}VITALITY_PRODUCT_KEY`);
  const emailDomain = requiredUserCreationSetting(`${profilePrefix}EMAIL_DOMAIN`).replace(/^@+/, '');
  if (!emailDomain || /[\s@]/.test(emailDomain)) {
    throw new Error('User enrolment requires a valid email domain.');
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const timestamp = now.toISOString().replace(/\D/g, '').slice(2, 14);
  const firstName = femaleFirstNames[randomInt(femaleFirstNames.length)];
  const familyName = surnames[randomInt(surnames.length)];
  const membershipReference = String(randomInt(1_000_000_000, 10_000_000_000));
  const externalMembershipId = `${timestamp}${randomInt(1000, 10_000)}`;
  const email = `${firstName}_${externalMembershipId}@${emailDomain}`;
  const bornOn = '1995-02-11';
  const endOfTime = '9999-12-31';
  const payload = {
    activateVitalityMembership: {
      membershipReferences: [{ typeKey: 1, value: membershipReference }],
      product: { identifierTypeKey: productKey },
      effectivePeriod: { effectiveTo: endOfTime, effectiveFrom: today },
      partyRoles: [{
        effectiveTo: endOfTime,
        emailAddresses: [{
          value: email,
          contactRoles: [{
            effectiveTo: endOfTime,
            typeKey: 1,
            availabilityFrom: '08:00:00',
            availabilityTo: '12:00:00',
            contactPurposes: [{ typeKey: '6' }],
            effectiveFrom: today
          }]
        }],
        person: {
          genderTypeKey: '2',
          bornOn,
          titleTypeKey: '3',
          familyName,
          givenName: firstName
        },
        roleTypeKey: 2,
        effectiveFrom: today,
        userCredential: {
          carrierPartyId: String(carrierPartyId),
          validUntil: endOfTime,
          validationSystem: 'VG_IDENTITY_SERVER',
          value: email
        },
        action: '21'
      }],
      externalMembershipIdentification: { referenceTypeKey: 4, value: externalMembershipId }
    },
    instructionTypeKey: 10
  };

  const response = await fetch(
    `${baseUrl}/vitality-enrolment-services-service-1/1.0/svc/${tenant}/instructionBasedEnrolment`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': userAgent,
        SI: 'Appium',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );
  if (response.status !== 200) {
    throw new Error(`User enrolment request expected HTTP 200 but received HTTP ${response.status}.`);
  }
  const responseBody: unknown = await response.json();
  const enrolment = asRecord(responseBody);
  const partyRoles = enrolment?.partyRoleOuts;
  const memberRole = Array.isArray(partyRoles)
    ? partyRoles.map(asRecord).find(role => role?.typeKey === 2)
    : undefined;
  const partyId = requiredPositiveId(memberRole?.partyId, 'partyRoleOuts member partyId');
  const insurerCode = memberRole?.insurerCode;
  if (typeof insurerCode !== 'string' || !insurerCode.trim()) {
    throw new Error('User enrolment response was missing a valid insurerCode.');
  }
  const vitalityMembershipId = requiredPositiveId(asRecord(enrolment?.vitalityMembership)?.id, 'vitalityMembership.id');

  return {
    carrierPartyId,
    partyId, insurerCode, vitalityMembershipId,
    firstName, familyName, email, userName: email, bornOn, membershipReference, externalMembershipId, response: responseBody
  };
}

export async function registerUser(
  user: Pick<EnrolledUser, 'userName' | 'insurerCode' | 'bornOn'>
): Promise<Response> {
  const registrationCode = Number(user.insurerCode);
  if (!/^\d+$/.test(user.insurerCode) || !Number.isSafeInteger(registrationCode) || registrationCode <= 0) {
    throw new Error('User registration requires a valid numeric insurerCode.');
  }
  if (!user.userName.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(user.bornOn)) {
    throw new Error('User registration requires a userName and bornOn in YYYY-MM-DD format.');
  }
  const password = requiredSetting('APP_PASSWORD');
  const response = await postIntegrationPlatform('register', {
    password,
    registrationCode,
    userName: user.userName,
    bornOn: user.bornOn
  });
  if (response.status !== 201) {
    throw new Error(`User registration request expected HTTP 201 but received HTTP ${response.status}.`);
  }
  return response;
}

// User login

export async function loginUser(userName: string): Promise<Response> {
  if (!userName.trim()) {
    throw new Error('User login requires a non-empty userName.');
  }
  const response = await postIntegrationPlatform('login', {
    loginRequest: {
      password: requiredSetting('APP_PASSWORD'),
      username: userName
    }
  });
  if (!response.ok) {
    throw new Error(`User login request failed with HTTP ${response.status}.`);
  }
  return response;
}

async function postIntegrationPlatform(endpoint: 'register' | 'login', body: unknown): Promise<Response> {
  const profilePrefix = getProfilePrefix();
  const baseUrl = requiredUserCreationSetting(`${profilePrefix}INTEGRATION_PLATFORM_BASE_URL`).replace(/\/+$/, '');
  const basicAuth = requiredUserCreationSetting(`${profilePrefix}API_BASIC_AUTH`).replace(/^Basic\s+/i, '');
  if (!basicAuth || basicAuth === '******') {
    throw new Error(`Provide a valid ${profilePrefix}API_BASIC_AUTH before calling ${endpoint}.`);
  }
  const userAgent = requiredUserCreationSetting('configUserAgent');
  return fetch(`${baseUrl}/tstc-integration-platform-services-service-v1/1.0/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'User-Agent': userAgent,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

//calculateVitalityStatus

export async function calculateVitalityStatus(vitalityMembershipId: number): Promise<Response> {
  if (!Number.isSafeInteger(vitalityMembershipId) || vitalityMembershipId <= 0) {
    throw new Error('Vitality status calculation requires a positive integer vitality membership ID.');
  }
  const profilePrefix = getProfilePrefix();
  const zuulUrl = requiredUserCreationSetting(`${profilePrefix}ZUUL_URL`).replace(/\/+$/, '');
  const tenant = requiredUserCreationSetting(`${profilePrefix}TENANT_NUMBER`);
  const response = await fetch(
    `${zuulUrl}/vitality-manage-vitality-status-service-1/svc/${tenant}/calculateVitalityStatus/${vitalityMembershipId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusPeriodOffset: -1 })
    }
  );
  if (!response.ok) {
    throw new Error(`Vitality status calculation request failed with HTTP ${response.status}.`);
  }
  return response;
}

function requiredPositiveId(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`User enrolment response was missing a valid ${field}.`);
  }
  return value;
}

function getProfilePrefix(): string {
  const environment = (userCreationSetting('VG_ENVIRONMENT') ?? 'mdev').toLowerCase();
  if (!['mdev', 'ca-test', 'ca-dev', 'uat'].includes(environment)) {
    throw new Error('VG_ENVIRONMENT must be one of: mdev, ca-test, ca-dev, uat.');
  }
  return `VG_${environment.toUpperCase().replace('-', '_')}_`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}


//User Instructions

export interface UserInstructionIds {
  LOGIN_T_AND_C_ID: number;
  GTBOnboardingJourney_ID: number;
  OnboardingJourney_ID: number;
  OnboardCommunPref_ID: number;
  OnboardingReward_ID: number;
}

function networkErrorCodes(error: unknown): string[] {
  const record = asRecord(error);
  if (!record) return [];
  const codes = typeof record.code === 'string' ? [record.code] : [];
  if (record.cause) codes.push(...networkErrorCodes(record.cause));
  if (Array.isArray(record.errors)) {
    codes.push(...record.errors.flatMap(networkErrorCodes));
  }
  return [...new Set(codes)];
}

async function fetchUserInstructionBody(url: string, userName: string): Promise<unknown> {
  const attempts = 3;
  const timeoutMs = 30_000;
  const endpoint = new URL(url);
  const target = `${endpoint.origin}${endpoint.pathname}`;
  const transientCodes = new Set([
    'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET'
  ]);

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let failure: Error;
    let retryable = false;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userName }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (response.ok) return await response.json();
      retryable = [502, 503, 504].includes(response.status);
      failure = new Error(`Get-user-instruction request failed with HTTP ${response.status} at ${target}.`);
      await response.body?.cancel();
    } catch (cause) {
      const codes = networkErrorCodes(cause);
      const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
      retryable = timedOut || (codes.length > 0 && codes.every(code => transientCodes.has(code)));
      const detail = timedOut ? `timeout after ${timeoutMs} ms` : codes.join(', ') || 'no network error code';
      failure = cause instanceof SyntaxError
        ? new Error(`Get-user-instruction response contained invalid JSON at ${target}.`, { cause })
        : new Error(
          `Get-user-instruction request failed at ${target} (${detail}). ` +
          'Check backend availability and this runner\'s VPN, DNS, proxy and TLS configuration.',
          { cause }
        );
    }
    if (!retryable || attempt === attempts) {
      throw new Error(`${failure.message} Failed after ${attempt} attempt(s).`, { cause: failure });
    }
    const backoffMs = 500 * 2 ** (attempt - 1);
    console.warn(`${failure.message} Retrying lookup (${attempt + 1}/${attempts}) in ${backoffMs} ms.`);
    await delay(backoffMs);
  }
  throw new Error('Get-user-instruction request exhausted its attempts.');
}

export async function getUserInstruction(userName: string): Promise<UserInstructionIds> {
  if (!userName.trim()) {
    throw new Error('Getting user instructions requires a non-empty userName.');
  }
  const profilePrefix = getProfilePrefix();
  const zuulUrl = requiredUserCreationSetting(`${profilePrefix}ZUUL_URL`).replace(/\/+$/, '');
  const tenant = requiredUserCreationSetting(`${profilePrefix}TENANT_NUMBER`);
  const body = await fetchUserInstructionBody(
    `${zuulUrl}/vitality-manage-user-service-1/svc/${tenant}/getUserInstruction`,
    userName
  );
  const instructions = asRecord(body)?.instructions;
  if (!Array.isArray(instructions)) {
    throw new Error('Get-user-instruction response was missing the instructions array.');
  }
  const instructionId = (typeCode: string): number => {
    const matches = instructions.map(asRecord).filter(instruction => instruction?.typeCode === typeCode);
    if (matches.length !== 1) {
      throw new Error(`Get-user-instruction response expected exactly one ${typeCode} instruction; received ${matches.length}.`);
    }
    const id = matches[0]?.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`Get-user-instruction response contained an invalid ID for ${typeCode}.`);
    }
    return id;
  };
  const LOGIN_T_AND_C_ID = instructionId('LOGIN_T_AND_C');
  const GTBOnboardingJourney_ID = instructionId('GTBOnboardingJourney');
  const OnboardingJourney_ID = instructionId('OnboardingJourney');
  const OnboardCommunPref_ID = instructionId('OnboardCommunPref');
  const OnboardingReward_ID = instructionId('OnboardingReward');

  return {
    LOGIN_T_AND_C_ID, GTBOnboardingJourney_ID, OnboardingJourney_ID,
    OnboardCommunPref_ID, OnboardingReward_ID
  };
}

async function fetchLoginEvent(url: string, init: RequestInit, profilePrefix: string): Promise<Response> {
  const endpoint = new URL(url);
  const timeoutMs = 30_000;
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (cause) {
    const codes = networkErrorCodes(cause);
    const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
    const detail = timedOut ? `timeout after ${timeoutMs} ms` : codes.join(', ') || 'no network error code';
    throw new Error(
      `Capture-login-events request failed for ${profilePrefix}INTEGRATION_PLATFORM_BASE_URL ` +
      `at ${endpoint.origin} (${detail}). ` +
      'Check backend availability and this runner\'s VPN, DNS, proxy and TLS configuration. ' +
      'The POST was not retried; confirm its backend outcome before replaying it.',
      { cause }
    );
  }
  if (!response.ok) {
    throw new Error(
      `Capture-login-events request failed with HTTP ${response.status} ` +
      `for ${profilePrefix}INTEGRATION_PLATFORM_BASE_URL at ${endpoint.origin}. ` +
      'The POST was not retried; confirm its backend outcome before replaying it.'
    );
  }
  return response;
}

//captureLoginEvents
export async function captureLoginEvents(partyId: number, LOGIN_T_AND_C_ID: number): Promise<Response> {
  if (!Number.isSafeInteger(partyId) || partyId <= 0) {
    throw new Error('Capturing login events requires a positive integer enrolment party ID.');
  }
  if (!Number.isSafeInteger(LOGIN_T_AND_C_ID) || LOGIN_T_AND_C_ID <= 0) {
    throw new Error('Capturing login events requires a positive integer LOGIN_T_AND_C_ID.');
  }
  const profilePrefix = getProfilePrefix();
  const baseUrl = requiredUserCreationSetting(`${profilePrefix}INTEGRATION_PLATFORM_BASE_URL`).replace(/\/+$/, '');
  const tenant = requiredUserCreationSetting(`${profilePrefix}TENANT_NUMBER`);
  const token = requiredUserCreationSetting(`${profilePrefix}API_BEARER_TOKEN`).replace(/^Bearer\s+/i, '');
  if (!token || token === '******') {
    throw new Error(`Provide a valid ${profilePrefix}API_BEARER_TOKEN before capturing login events.`);
  }
  const userAgent = requiredUserCreationSetting('configUserAgent');
  const currentDateTime = getCurrentDateTime();
  const response = await fetchLoginEvent(
    `${baseUrl}/vitality-manage-user-service-v1/1.0/svc/${tenant}/captureLoginEvents/${partyId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': userAgent,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        loginDate: currentDateTime,
        loginSuccess: true,
        userInstructionResponses: [{ id: LOGIN_T_AND_C_ID, typeKey: 1, value: 'true' }]
      })
    },
    profilePrefix
  );
  return response;
}
//processEventToCreateReward
export async function processEventToCreateReward(partyId: number): Promise<Response> {
  if (!Number.isSafeInteger(partyId) || partyId <= 0) {
    throw new Error('Creating a reward event requires a positive integer enrolment party ID.');
  }
  const profilePrefix = getProfilePrefix();
  const baseUrl = requiredUserCreationSetting(`${profilePrefix}INTEGRATION_PLATFORM_BASE_URL`).replace(/\/+$/, '');
  const tenant = requiredUserCreationSetting(`${profilePrefix}TENANT_NUMBER`);
  const token = requiredUserCreationSetting(`${profilePrefix}API_BEARER_TOKEN`).replace(/^Bearer\s+/i, '');
  if (!token || token === '******') {
    throw new Error(`Provide a valid ${profilePrefix}API_BEARER_TOKEN before creating a reward event.`);
  }
  const currentDateTime = getCurrentDateTime();
  const response = await fetch(
    `${baseUrl}/vitality-manage-rewards-service/1.0/svc/${tenant}/processEventToCreateReward`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        eventExists: false,
        eventIn: [{
          applicableTo: partyId,
          eventCapturedOn: currentDateTime,
          eventOccuredOn: currentDateTime,
          eventSourceTypeKey: 1,
          reportedBy: partyId,
          typeKey: 2298
        }]
      })
    }
  );
  if (!response.ok) {
    throw new Error(`Create-reward-event request failed with HTTP ${response.status}.`);
  }
  return response;
}
//processEvents
export async function processEvents(partyId: number): Promise<Response> {
  if (!Number.isSafeInteger(partyId) || partyId <= 0) {
    throw new Error('Processing events requires a positive integer enrolment party ID.');
  }
  const profilePrefix = getProfilePrefix();
  const baseUrl = requiredUserCreationSetting(`${profilePrefix}INTEGRATION_PLATFORM_BASE_URL`).replace(/\/+$/, '');
  const tenant = requiredUserCreationSetting(`${profilePrefix}TENANT_NUMBER`);
  const token = requiredUserCreationSetting(`${profilePrefix}API_BEARER_TOKEN`).replace(/^Bearer\s+/i, '');
  if (!token || token === '******') {
    throw new Error(`Provide a valid ${profilePrefix}API_BEARER_TOKEN before processing events.`);
  }
  const currentDateTime = getCurrentDateTime();
  const response = await fetch(
    `${baseUrl}/vitality-manage-events-service-v1/1.0/svc/${tenant}/processEvents`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        processEventsRequest: {
          eventIn: [{
            applicableTo: partyId,
            eventCapturedOn: currentDateTime,
            eventMetaData: [{ typeKey: 197, value: 1001 }],
            eventOccuredOn: currentDateTime,
            eventSourceTypeKey: 1,
            reportedBy: partyId,
            typeKey: 1016
          }]
        }
      })
    }
  );
  if (!response.ok) {
    throw new Error(`Process-events request failed with HTTP ${response.status}.`);
  }
  return response;
}
// Delete the GTBOnboardingJourney_ID,OnboardingJourney_ID, OnboardCommunPref_ID, OnboardingReward_ID
export async function deleteUserInstruction(
  userName: string,
  instructionIds: Omit<UserInstructionIds, 'LOGIN_T_AND_C_ID'>
): Promise<Response> {
  if (!userName.trim()) {
    throw new Error('Deleting user instructions requires a non-empty userName.');
  }
  const ids = [
    instructionIds.GTBOnboardingJourney_ID,
    instructionIds.OnboardingJourney_ID,
    instructionIds.OnboardCommunPref_ID,
    instructionIds.OnboardingReward_ID
  ];
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new Error('Deleting user instructions requires four distinct positive integer onboarding instruction IDs.');
  }
  const profilePrefix = getProfilePrefix();
  const baseUrl = requiredUserCreationSetting(`${profilePrefix}INTEGRATION_PLATFORM_BASE_URL`).replace(/\/+$/, '');
  const tenant = requiredUserCreationSetting(`${profilePrefix}TENANT_NUMBER`);
  const token = requiredUserCreationSetting(`${profilePrefix}API_BEARER_TOKEN`).replace(/^Bearer\s+/i, '');
  if (!token || token === '******') {
    throw new Error(`Provide a valid ${profilePrefix}API_BEARER_TOKEN before deleting user instructions.`);
  }
  const userAgent = requiredUserCreationSetting('configUserAgent');
  const response = await fetch(
    `${baseUrl}/vitality-manage-user-service-v1/1.0/svc/${tenant}/deleteUserInstruction`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': userAgent,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        instructions: ids.map(id => ({ id })),
        userId: userName
      })
    }
  );
  if (!response.ok) {
    throw new Error(`Delete-user-instruction request failed with HTTP ${response.status}.`);
  }
  return response;
}

export function printUserDetails(
  user: Pick<EnrolledUser, 'userName' | 'partyId' | 'insurerCode' | 'bornOn'>
): void {
  const loginPrefix = requiredUserCreationSetting(`${getProfilePrefix()}LOGIN_PREFIX`);
  console.log(`User email ID: ${loginPrefix}${user.userName}`);
  console.log(`Party ID: ${user.partyId}`);
  console.log(`Insurer code: ${user.insurerCode}`);
  console.log(`Date of birth: ${user.bornOn}`);
}

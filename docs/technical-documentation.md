# Technical Documentation

## 1. Purpose and scope

This document describes the current Appium mobile-testing proof of concept
(PoC): its TypeScript/WebdriverIO architecture, real-device session setup,
test-user provisioning boundary, execution lifecycle, and reporting outputs.
It is intended as an implementation guide for maintaining and extending the
PoC. It documents the behavior currently implemented in the repository; it is
not a production-readiness or application-under-test specification.

For installation, credentials, and copy-paste run commands, see the root
[README](../README.md). Never put real credentials, member data, or generated
test evidence in this document.

## 2. Technology and execution model

- **Runtime:** Node.js 20+ with TypeScript running through `tsx`.
- **Mobile automation:** WebdriverIO 9, Mocha, and Appium.
- **Device provider:** TestMu AI real-device cloud (formerly LambdaTest).
- **Platforms:** Android with UiAutomator2; iOS with XCUITest.
- **Reports:** WebdriverIO spec output and Allure results.
- **Local utility tests:** Node.js built-in test runner.

The test process runs locally. It uses the local Node.js worker to resolve
configuration and, for applicable scenarios, create a test account through
the configured backend APIs. The mobile automation session itself is created
on the cloud device provider using the WebDriver endpoint.

## 3. Component map

```text
scripts/run-mobile-tests.ts
  -> wdio.conf.ts
       -> src/config/mobileSessionInit.ts
       -> src/config/runner.ts
       -> src/config/timeoutsHandling.ts
       -> tests/helpers/user_helpers/TestUser.ts (beforeSession)
       -> tests/{smoke,regression}/*.spec.ts
            -> tests/helpers/*.ts
            -> src/pages/*.ts
       -> src/utils/ExecutionReporter.ts
       -> src/utils/browserLauncher.ts

scripts/serve-allure-report.ts
  -> scripts/generate-allure-report.ts
  -> src/utils/allureResultFilter.ts
```

| Area | Responsibility |
| --- | --- |
| `scripts/run-mobile-tests.ts` | Prompts for platform/environment in an interactive terminal, applies the default smoke worker limit, and starts the WebdriverIO CLI as a child process. |
| `wdio.conf.ts` | Resolves run settings, configures WebdriverIO/Mocha/reporters, provisions accounts before sessions, and connects test hooks to reporting and cleanup. |
| `src/config/mobileSessionInit.ts` | Loads cloud settings, validates platform/app selection, constructs capabilities and endpoint configuration, names sessions, and provides artifact-path helpers. |
| `src/config/runner.ts` | Maps scenario names to spec files and declares smoke/regression suites and account-provisioning policies. |
| `src/config/properties.ts` | Parses Java-properties-like files and decodes explicitly Base64-prefixed supported values. |
| `src/config/userCreation.ts` | Reads the separate test-user provisioning settings file and environment overrides. |
| `src/config/API-to-Create-New-User.ts` | Implements the backend API calls used by account setup. |
| `tests/helpers/user_helpers/TestUser.ts` | Performs pre-session account creation for scenarios that require a new member and exposes the created member to tests. |
| `tests/helpers/` | Shared flows, test hooks, account utilities, and local unit tests. |
| `src/pages/` | Screen/page objects containing app interactions and selectors. |
| `src/utils/ExecutionReporter.ts` | Writes execution logs and per-test evidence locally and attaches supported evidence to Allure. |
| `scripts/serve-allure-report.ts` | Serves a local filter UI for date/environment-filtered Allure report generation. |

## 4. Test selection and scenario registry

The runner resolves `LT_SCENARIO` (default `loginAndLogout`) through
`src/config/runner.ts`. The registry currently contains:

| Scenario | Spec | Provisions a member |
| --- | --- | --- |
| `loginAndLogout` | `tests/smoke/login-logout.spec.ts` | Yes |
| `lockout` | `tests/regression/incorrect-password-lockout.spec.ts` | Yes |
| `mha-low-risk` | `tests/regression/mha-low-risk.spec.ts` | Yes |
| `mha-high-risk` | `tests/smoke/mha-high-risk.spec.ts` | Yes |
| `mha-unanswered` | `tests/regression/mha-unanswered.spec.ts` | Yes |
| `mha-exit-partial` | `tests/regression/mha-exit-partial.spec.ts` | Yes |
| `mha-privacy-cancel` | `tests/regression/mha-privacy-cancel.spec.ts` | Yes |
| `screening` | `tests/regression/screening-vaccination.spec.ts` | Yes |

`loginAndLogout` is the default scenario. Other values must match a registry
key. Smoke and regression suites are separately declared in the same registry;
the wrapper gives smoke runs a default `maxInstances` of five unless the caller
specifies one. `wdio.conf.ts` otherwise sets `maxInstances` to one.

Every WebdriverIO session must receive exactly one spec. This is checked when
assigning the cloud session name and when selecting the test-account
provisioning policy. A suite may contain multiple specs, but each worker
session receives its own spec and follows the same pre-session hook.

The configured app ID is resolved once from the run's platform and settings;
it is not mapped from each individual spec in the scenario registry. When
running a suite whose specs require different uploaded app builds, configure
the selected app appropriately or run those scenarios separately.

## 5. Settings and precedence

Mobile/cloud settings are read by `mobileSessionInit.ts` from environment
variables and then from `lambdatest.properties` in the project root or
`src/test/resources/lambdatest.properties`. A non-empty environment value
takes precedence over a file value. The property loader reads the root file
before the nested file, so a duplicate key in the nested file takes precedence
over the root-file value. Missing optional files are ignored; other file-read
errors are surfaced.

User-creation settings are a separate concern: `userCreation.ts` reads
`user-creation.properties` and environment variables. Do not assume a value in
one properties file is automatically available to the other configuration
reader. The required per-environment prefixes and fields are documented in the
[README setup section](../README.md#user-creation-environments).

### Mobile/cloud settings

| Purpose | Keys and behavior |
| --- | --- |
| Cloud credentials | `LT_USERNAME` and `LT_ACCESS_KEY`; legacy aliases `UserName` and `AccessKey` are accepted. Both are required. |
| App under test | Precedence: `appId`, platform-specific `LT_ANDROID_APP_ID` / `LT_IOS_APP_ID`, legacy `androidAppId` / `iosAppId`, then shared `LT_APP_ID`. An App ID is required. |
| Platform | `PLATFORM`, then `platform`, default `Android`. Accepted values are Android or iOS, case-insensitive. |
| Device and OS version | `device` then `LT_DEVICE`; `version` then `LT_VERSION`. Defaults are `Galaxy S.*` / `14` for the helper's `android-login` special case, `Galaxy S.*` / `.*` for other Android scenarios, and `iPhone .*` / `.*` for iOS. The current scenario registry does not use the `android-login` key, so registered Android scenarios default to `.*`. |
| Grid endpoint | `LT_GRID_URL`, default `mobile-hub.lambdatest.com`. The scheme defaults to HTTPS and `/wd/hub` is appended when absent. |
| Build and session labels | `LT_BUILD_NAME` and `LT_TEST_NAME`; a session name is refined from the worker's `.spec.ts` filename before session start. |
| Optional cloud project | The implementation reads a property whose key is `Central Project_Mobile Appium` followed by a trailing space and adds it as the LambdaTest project option when present. |
| Browser behavior | `LT_OPEN_LIVE_SESSION` defaults to `true`; any non-empty `CI` setting disables auto-opening. Setting `LT_OPEN_LIVE_SESSION=false` also disables it. |
| Local evidence directory | `LT_ARTIFACTS_DIR`, default `target/test-artifacts`. |
| Optional cleanup target | `ANDROID_APP_PACKAGE` / `LT_ANDROID_APP_PACKAGE` or `IOS_BUNDLE_ID` / `LT_IOS_BUNDLE_ID`; when supplied, the app is removed after execution. |

The property parser accepts `key=value` and `key:value` lines and ignores blank
lines and lines beginning with `#` or `!`. A `base64:` prefix is decoded only
for `LT_USERNAME`, `LT_ACCESS_KEY`, their legacy aliases, and `APP_PASSWORD`
when those values come from the properties file. This encoding is reversible
and must not be treated as secret storage. Environment-variable values are not
decoded.

## 6. Mobile session initialization

The session setup is implemented in
[`src/config/mobileSessionInit.ts`](../src/config/mobileSessionInit.ts) and
consumed by [`wdio.conf.ts`](../wdio.conf.ts).

1. **Resolve platform and scenario.** The platform is validated; the selected
   scenario is resolved from `LT_SCENARIO` with a default of `loginAndLogout`.
2. **Resolve endpoint and timeouts.** The configured grid URL is normalized
   into a WebDriver endpoint. `LT_WAIT_SECONDS` defaults to 300 seconds and
   `LT_TEST_TIMEOUT_SECONDS` defaults to 900 seconds. Both must be positive,
   within the supported timer range, and the whole-test timeout must exceed
   the element-wait timeout.
3. **Build capabilities.** Cloud credentials, app ID, device, and OS version
   are required/resolved before WebdriverIO starts. Capabilities set the
   platform-specific automation engine, cloud options, app-reset behavior,
   and a 1,800-second Appium idle timeout. Video and visual capture are
   enabled. iOS additionally enables automatic alert acceptance.
4. **Name the session per spec.** `beforeSession` derives the scenario suffix
   from the sole `.spec.ts` filename. `LT_TEST_NAME`, when set, is used as a
   prefix. Invalid or multiple spec inputs fail rather than producing an
   ambiguous session name.
5. **Provision before device session.** The same hook initializes any
   scenario-specific account before the cloud session is opened. If setup
   fails, the worker logs the error and exits with a non-zero code; it does
   not continue with a fixed-account fallback.
6. **Execute and capture evidence.** `beforeTest` records the cloud session
   link and configuration, optionally opens the live session dashboard, waits
   briefly for the app to load, and captures initial evidence.
7. **Finish and clean up.** `afterTest` captures a pass/failure screenshot;
   failures also capture the current page source. The `after` hook optionally
   removes the configured app and makes a best-effort attempt to close the
   dashboard browser tab/window.

The app reset settings are `fullReset: true` and `noReset: false` in both the
Appium and cloud capability options. This favors a clean app state for each
session. The optional app-removal hook is separate and runs only when a bundle
ID/package name is configured.

## 7. Test-account provisioning boundary

Provisioning runs in the local Node.js worker's WebdriverIO `beforeSession`
hook, not on the mobile device. The scenario registry determines whether an
account is required. For a provisioning scenario, the helper validates the
selected environment and required profile settings, then runs the configured
backend sequence: create party, enrol member, register member, calculate
status, retrieve user instructions, capture login events, process reward and
other events, and delete the onboarding instruction. The generated login
identity is made available to tests only after the sequence succeeds.

The screening/vaccination scenario provisions a fresh member and logs in with
the generated username. The lockout scenario additionally requires an incorrect
password that differs from `APP_PASSWORD`. Provisioning writes are not
automatically retried because replaying a partially completed write sequence
could create duplicate state. Backend/API error handling and operational
troubleshooting details are in the [README](../README.md).

Keep user-creation credentials and cloud credentials in their respective
configuration sources. Do not log secrets or place real account details in
fixtures, documentation, screenshots, page-source captures, or shared report
artifacts.

## 8. Reporting and artifacts

For each test, `ExecutionReporter` creates a timestamped directory under
`target/test-artifacts/` (or the configured artifacts root). Evidence can
include:

- `execution.log`, including session ID/dashboard URL and execution status;
- a text session configuration snapshot;
- screenshots at app load and test completion;
- failure-time screenshot and page source.

The WebdriverIO Allure reporter writes source results to
`target/allure-results/`. The custom reporter attaches execution steps and
available evidence. The local report UI can generate separate filtered reports
under `target/allure-filtered-reports/`; it does not modify the source results.
Generated output is ignored by Git. Treat artifacts and reports as potentially
sensitive because they may contain member or screen data; limit retention and
access, especially in CI.

The live-session dashboard URL is derived from the cloud session ID and logged
regardless of whether automatic browser opening is enabled. Closing the
dashboard is best-effort and must not be relied on as a cloud-session
termination mechanism.

## 9. Local validation and cloud execution

Local unit tests exercise utility/configuration behavior without requiring an
Appium cloud session. TypeScript validation checks compilation. Full mobile
scenario execution requires valid cloud credentials, a compatible uploaded
app, and any backend settings/accounts required by that scenario.

```bash
npm run typecheck
npm run test:unit
```

Use the documented `npm run test:*` commands in the
[README](../README.md#run-the-scenarios) for cloud execution. Cloud runs can
consume device-farm capacity and interact with backend environments; confirm
the selected platform, environment, App ID, and test-account settings before
starting one.

## 10. Current PoC boundaries

- The cloud provider and real-device execution model are configured in the
  current implementation; a local Appium-server execution mode is not exposed
  by this runner.
- App IDs are configuration-driven and shared across the worker's specs; the
  scenario registry does not currently assign an app ID per spec.
- Device selection uses provider matching strings and defaults; it does not
  guarantee a particular device instance or OS patch level.
- Test-user setup depends on external backend services and environment
  profiles. Local unit tests do not prove those services are reachable or that
  cloud execution will pass.
- Some negative/partial assessment journeys are opt-in and their unimplemented
  behaviors are listed in the README. Do not treat them as verified coverage.
- Dashboard opening/closing and evidence capture are convenience/diagnostic
  behavior, not a replacement for managed cloud-session lifecycle or secure
  artifact retention.

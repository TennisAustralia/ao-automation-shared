import * as fs from 'fs'
import * as path from 'path'
import Debug from 'debug'
import { getPayloadRoot } from '../internal/payload-access.js'

const debug = Debug('tournament:payload-api')

export type EnvironmentName = 'PERF' | 'DEV' | 'UAT' | 'DEV2' | 'AUTOMATION' | 'AO-APP' | string

export interface Team {
  OrgName?: string
  Seed?: number | string
  Country?: string
  Status?: string
}

export interface Match {
  ID: string
  Event: string
  Teams: Team[]
  RoundName: string
  LineNumber?: number
  Status?: string
  CourtName?: string
  Score?: string
}

export interface Payload {
  Name: string
  Year: number
  MsgID: string
  Today?: string
  Matches: Match[]
}

export interface PayloadInfo {
  filename: string
  eventName?: string
  totalMatches?: number
  playerCount?: number
  matchCount?: number
  date?: string
}

export interface PostPayloadOptions {
  smtApiUrl?: string
  apiKey?: string
  payloadRoot?: string
  maxRetries?: number
}

export interface PostPayloadBatchOptions extends PostPayloadOptions {
  expectedTournamentName?: string
  interactionDelayMs?: number
}

export interface LocatorLike {
  waitFor(options?: unknown): Promise<void>
  click(options?: unknown): Promise<void>
  fill(value: string): Promise<void>
  isVisible(options?: unknown): Promise<boolean>
  isChecked?(): Promise<boolean>
  locator(selector: string): LocatorLike
  first(): LocatorLike
  nth(index: number): LocatorLike
  getByRole(role: string, options?: unknown): LocatorLike
  selectOption?(option: { label: string }): Promise<void>
  count?(): Promise<number>
  textContent?(options?: unknown): Promise<string | null>
}

export interface PageLike {
  url(): string
  goto?(url: string): Promise<void>
  waitForTimeout(ms: number): Promise<void>
  reload(options?: unknown): Promise<void>
  waitForLoadState?(state: string, options?: unknown): Promise<void>
  locator(selector: string): LocatorLike
}

export interface SimulatorLike {
  goto(): Promise<void>
  waitForPageLoad(): Promise<void>
  environmentHeading(envName: string): LocatorLike
  environmentPanel(envName: string): LocatorLike
  editOptionsButton(envName: string): LocatorLike
  saveButton(envName: string): LocatorLike
  abortButton(envName: string): LocatorLike
  clearDataButton(envName: string): LocatorLike
  abortOperation(envName: string): Promise<void>
  clearEnvironmentData(envName: string): Promise<void>
  prepAndRefresh(envName: string): Promise<void>
}

export interface DrawsPageLike {
  goto(url: string): Promise<void>
  getAllEvents?(): Promise<string[]>
  selectEvent?(eventName: string): Promise<void>
  waitForDrawLoad?(): Promise<void>
}

export type PageHelper = DrawsPageLike

const DEFAULT_EMPTY_STATE = {
  maxRetries: 20,
  retryDelayMs: 20_000,
  pageLoadMs: 5_000,
  reloadTimeoutMs: 180_000,
  networkIdleTimeoutMs: 10_000,
  dropdownUpdateMs: 150,
  formSubmissionMs: 800,
  textTimeoutInitialMs: 3_000,
  textTimeoutConfirmedMs: 500,
  stabilizationWaitMs: 10_000,
}

async function locatorCount(locator: LocatorLike): Promise<number> {
  if (!locator.count) {
    return 0
  }
  return locator.count()
}

async function locatorText(locator: LocatorLike, options?: unknown): Promise<string | null> {
  if (!locator.textContent) {
    return null
  }
  try {
    return await locator.textContent(options)
  } catch {
    return null
  }
}

function getPayloadPath(payloadFilePath: string, payloadRoot?: string): string {
  const baseRoot = payloadRoot ?? getPayloadRoot()
  return path.join(baseRoot, payloadFilePath)
}

/**
 * Post a payload JSON file to the SMT API with retry for transient network failures.
 */
export async function postPayloadToAPI(
  payloadFilePath: string,
  options: PostPayloadOptions = {}
): Promise<Payload> {
  const smtApiUrl = options.smtApiUrl ?? process.env.SMT_API_URL
  const apiKey = options.apiKey ?? process.env.SMT_API_KEY

  if (!smtApiUrl || !apiKey) {
    throw new Error(
      'Missing required environment variables:\n' +
        `  SMT_API_URL: ${smtApiUrl || 'NOT SET'}\n` +
        `  SMT_API_KEY: ${apiKey ? 'SET' : 'NOT SET'}`
    )
  }

  const payloadPath = getPayloadPath(payloadFilePath, options.payloadRoot)
  if (!fs.existsSync(payloadPath)) {
    throw new Error(`Payload file not found: ${payloadPath}`)
  }

  const payloadContent = fs.readFileSync(payloadPath, 'utf-8')
  const payload: Payload = JSON.parse(payloadContent)

  debug(`Posting payload: ${payloadFilePath}`)
  const maxRetries = options.maxRetries ?? 3
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(smtApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: payloadContent,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Failed to post payload to SMT API:\n` +
            `  Status: ${response.status} ${response.statusText}\n` +
            `  Response: ${errorText}`
        )
      }

      await response.json().catch(() => null)
      if (attempt > 1) {
        debug(`Payload posted successfully on retry attempt ${attempt}`)
      }
      return payload
    } catch (error) {
      lastError = error as Error
      const isNetworkError =
        lastError.message.includes('ECONNRESET') ||
        lastError.message.includes('ETIMEDOUT') ||
        lastError.message.includes('ECONNREFUSED') ||
        lastError.message.includes('fetch failed')

      if (isNetworkError && attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt - 1) * 1000
        debug(
          `Network error on attempt ${attempt}/${maxRetries}: ${lastError.message}. Retrying in ${waitTime / 1000}s...`
        )
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      } else {
        throw lastError
      }
    }
  }

  throw lastError || new Error('Unknown error posting payload')
}

/**
 * Poll scoring API until draw data is available.
 */
export async function waitForDataProcessing(timeoutMs: number = 900000): Promise<boolean> {
  const scoringApiUrl = process.env.DRAWS_SCORING_API
  if (!scoringApiUrl) {
    throw new Error('DRAWS_SCORING_API environment variable not set')
  }

  const startTime = Date.now()
  const pollInterval = 5000

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(scoringApiUrl)
      if (response.ok) {
        const data = await response.json()
        const hasRounds = data.rounds && data.rounds.length > 0
        const hasPlayers = data.players && data.players.length > 0
        const hasTeams = data.teams && data.teams.length > 0
        const hasData = hasRounds && (hasPlayers || hasTeams)
        const hasNoDataMessage = data.heading && data.heading.includes('not available')
        if (hasData && !hasNoDataMessage) {
          return true
        }
      }
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  return false
}

/**
 * Extract event id from DRAWS_SCORING_API URL.
 */
export function getEventId(scoringApiUrl?: string): string {
  const apiUrl = scoringApiUrl ?? process.env.DRAWS_SCORING_API
  if (!apiUrl) {
    throw new Error('DRAWS_SCORING_API environment variable not set')
  }

  const match = apiUrl.match(/\/event\/(\d+)\//)
  if (!match) {
    throw new Error(`Could not extract event ID from DRAWS_SCORING_API: ${apiUrl}`)
  }

  return match[1]
}

/**
 * Web orchestration helper: clear environment data with the same flow used in AO web tests.
 */
export async function clearScoringData(
  page: PageLike,
  simulator: SimulatorLike,
  envName: EnvironmentName
): Promise<void> {
  await simulator.goto()
  await simulator.waitForPageLoad()

  const envHeading = simulator.environmentHeading(envName)
  await envHeading.waitFor({ state: 'visible', timeout: 30000 })

  const envPanel = simulator.environmentPanel(envName)
  const cancelButton = envPanel.getByRole('button', { name: /cancel/i })
  const isDialogAlreadyOpen = await cancelButton.isVisible({ timeout: 2000 }).catch(() => false)

  if (!isDialogAlreadyOpen) {
    const editButton = simulator.editOptionsButton(envName)
    try {
      await editButton.waitFor({ state: 'visible', timeout: 30000 })
    } catch {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(3000)
      await envPanel.waitFor({ state: 'visible', timeout: 30000 })
      await editButton.waitFor({ state: 'visible', timeout: 30000 })
    }
    await editButton.click()
    await page.waitForTimeout(2000)
  }

  const startDateTextbox = envPanel.locator('input[type="text"]').first()
  await startDateTextbox.click()
  await startDateTextbox.fill('18-Jan-26 00:00')

  await envHeading.click()
  await page.waitForTimeout(500)

  const runToCheckbox = envPanel.locator('input[type="checkbox"]').first()
  const isChecked = runToCheckbox.isChecked ? await runToCheckbox.isChecked() : false
  if (!isChecked) {
    await runToCheckbox.click()
  }

  const runToDateTextbox = envPanel.locator('input[type="text"]').nth(1)
  await runToDateTextbox.click()
  await runToDateTextbox.fill('02-Feb-26 00:00')

  await envHeading.click()
  await page.waitForTimeout(500)

  const saveButton = simulator.saveButton(envName)
  await saveButton.click({ force: true })
  await page.waitForTimeout(3000)

  const hasAbortButton = await simulator.abortButton(envName).isVisible().catch(() => false)
  const hasClearButton = await simulator.clearDataButton(envName).isVisible().catch(() => false)
  if (hasAbortButton && !hasClearButton) {
    await simulator.abortOperation(envName)
    await page.waitForTimeout(3000)
  }

  await simulator.clearEnvironmentData(envName)
}

/**
 * Higher-level wrapper used by web setup flow to clear Drupal and wait for stabilization.
 */
export async function clearDrupalData(
  page: PageLike,
  simulator: SimulatorLike,
  envName: EnvironmentName
): Promise<void> {
  await clearScoringData(page, simulator, envName)
  await page.waitForTimeout(DEFAULT_EMPTY_STATE.stabilizationWaitMs)
}

/**
 * Web orchestration helper: execute prep + refresh via simulator.
 */
export async function refreshDrupalCache(
  page: PageLike,
  simulator: SimulatorLike,
  envName: EnvironmentName
): Promise<void> {
  if (!page.url().includes('simulator.ausopen.com')) {
    await simulator.goto()
    await simulator.waitForPageLoad()
  }
  await simulator.prepAndRefresh(envName)
}

/**
 * Wrapper retained for AO web parity naming.
 */
export async function prepAndRefresh(
  page: PageLike,
  simulator: SimulatorLike,
  envName: EnvironmentName
): Promise<void> {
  await refreshDrupalCache(page, simulator, envName)
}

/**
 * Post a set of payload files sequentially.
 */
export async function postPayloads(
  page: PageLike,
  payloadFiles: string[],
  _description?: string,
  options: PostPayloadBatchOptions = {}
): Promise<void> {
  const expectedTournamentName = options.expectedTournamentName ?? 'Australian Open'
  const interactionDelayMs = options.interactionDelayMs ?? 500

  for (const file of payloadFiles) {
    const payload = await postPayloadToAPI(file, options)
    if (!payload || !payload.Name) {
      throw new Error(`Invalid payload posted for file: ${file}`)
    }
    if (payload.Name !== expectedTournamentName) {
      throw new Error(
        `Unexpected tournament name for ${file}: expected "${expectedTournamentName}", got "${payload.Name}"`
      )
    }
    await page.waitForTimeout(interactionDelayMs)
  }
}

/**
 * Log discovered payload lists in the same format used by AO web setup.
 */
export function logDiscoveredPayloads(
  sopPayloads: PayloadInfo[],
  drawPayloads: PayloadInfo[],
  allPlayersPayloads: PayloadInfo[],
  schedulePayloads?: PayloadInfo[],
  sampledDrawPayloads?: PayloadInfo[]
): void {
  debug(`Found ${sopPayloads.length} SOP payload(s)`)
  for (const sop of sopPayloads) {
    debug(`  - ${sop.eventName}: ${sop.filename} (${sop.totalMatches ?? 0} matches)`)
  }

  debug(`Found ${drawPayloads.length} draw payload(s)`)
  if (sampledDrawPayloads && sampledDrawPayloads.length > 0) {
    const sampledEventNames = new Set(sampledDrawPayloads.map((d) => d.eventName))
    for (const draw of drawPayloads) {
      const isSampled = sampledEventNames.has(draw.eventName)
      debug(
        `  ${isSampled ? '*' : '-'} ${draw.eventName}: ${draw.filename} (${draw.totalMatches ?? 0} matches)`
      )
    }
  } else {
    for (const draw of drawPayloads) {
      debug(`  - ${draw.eventName}: ${draw.filename} (${draw.totalMatches ?? 0} matches)`)
    }
  }

  debug(`Found ${allPlayersPayloads.length} AllPlayers payload(s)`)
  for (const allPlayers of allPlayersPayloads) {
    debug(`  - ${allPlayers.filename} (${allPlayers.playerCount ?? 0} players, ${allPlayers.date ?? ''})`)
  }

  if (schedulePayloads && schedulePayloads.length > 0) {
    debug(`Found ${schedulePayloads.length} Schedule payload(s)`)
    for (const schedule of schedulePayloads) {
      debug(`  - ${schedule.filename} (${schedule.matchCount ?? 0} matches)`)
    }
  }
}

/**
 * Verify that a rendered match card contains expected team names (and optionally seeds).
 */
export async function verifyMatchDisplayed(
  page: PageLike,
  match: Match,
  matchIndex: number = 0
): Promise<void> {
  const matchCards = page.locator('a.match-card, div.match-card, a[href*="/match/"]')
  const matchCard = matchCards.nth(matchIndex)
  await matchCard.waitFor({ state: 'visible', timeout: 10000 })

  if (!matchCard.textContent) {
    throw new Error('Locator implementation does not support textContent()')
  }
  const cardText = await matchCard.textContent()
  if (!cardText) {
    throw new Error(`Match card ${matchIndex} has no text content`)
  }

  const player1Name = match.Teams[0]?.OrgName || 'TBD'
  const player2Name = match.Teams[1]?.OrgName || 'TBD'
  if (!cardText.includes(player1Name)) {
    throw new Error(`Player 1 name "${player1Name}" not found in match card`) 
  }
  if (!cardText.includes(player2Name)) {
    throw new Error(`Player 2 name "${player2Name}" not found in match card`)
  }
}

/**
 * Verify Draws empty state with retries and event-by-event checks.
 */
export async function verifyDrawsEmptyState(
  page: PageLike,
  drawsPage: DrawsPageLike,
  envName: EnvironmentName,
  drawsWebsiteUrl: string = process.env.DRAWS_WEBSITE || ''
): Promise<void> {
  if (!drawsWebsiteUrl) {
    throw new Error('DRAWS_WEBSITE is not set and drawsWebsiteUrl was not provided')
  }

  await drawsPage.goto(drawsWebsiteUrl)

  for (let attempt = 1; attempt <= DEFAULT_EMPTY_STATE.maxRetries; attempt++) {
    await page.waitForTimeout(DEFAULT_EMPTY_STATE.pageLoadMs)
    await drawsPage.waitForDrawLoad?.()

    const errorLocator = page.locator('text=/fault.*experiencing.*problem/i')
    const hasErrorState = (await locatorCount(errorLocator)) > 0

    if (hasErrorState) {
      if (attempt < DEFAULT_EMPTY_STATE.maxRetries) {
        await page.waitForTimeout(DEFAULT_EMPTY_STATE.retryDelayMs)
        await page.reload({ waitUntil: 'domcontentloaded', timeout: DEFAULT_EMPTY_STATE.reloadTimeoutMs })
        continue
      }
      throw new Error(
        `Error state persisted after ${DEFAULT_EMPTY_STATE.maxRetries} attempts. Check ${envName} environment health.`
      )
    }

    const emptyStateHeading = await page
      .locator('h2:has-text("not available at this time")')
      .first()
    const emptyStateHeadingText = await locatorText(emptyStateHeading)

    if (emptyStateHeadingText) {
      if (!/The .+ draw is not available at this time\./.test(emptyStateHeadingText)) {
        throw new Error(`Unexpected empty state heading: ${emptyStateHeadingText}`)
      }

      if (drawsPage.getAllEvents && drawsPage.selectEvent) {
        const allEvents = await drawsPage.getAllEvents()
        let firstEventConfirmed = false
        const dropdown = page.locator('select').first()

        for (const rawEventName of allEvents) {
          const eventName = rawEventName.trim()

          if (firstEventConfirmed && dropdown.selectOption) {
            await dropdown.selectOption({ label: eventName })
            await page.waitForTimeout(DEFAULT_EMPTY_STATE.dropdownUpdateMs)
          } else {
            await drawsPage.selectEvent(eventName)
            await page.waitForTimeout(DEFAULT_EMPTY_STATE.formSubmissionMs)
            await page
              .waitForLoadState?.('domcontentloaded', {
                timeout: DEFAULT_EMPTY_STATE.networkIdleTimeoutMs,
              })
          }

          const textTimeout = firstEventConfirmed
            ? DEFAULT_EMPTY_STATE.textTimeoutConfirmedMs
            : DEFAULT_EMPTY_STATE.textTimeoutInitialMs

          const eventEmptyState = await page
            .locator('h2:has-text("not available at this time")')
            .first()
          const eventEmptyStateText = await locatorText(eventEmptyState, { timeout: textTimeout })

          if (eventEmptyStateText) {
            firstEventConfirmed = true
          } else if (!firstEventConfirmed) {
            throw new Error(
              `Event "${eventName}" does not show empty state. Check ${envName} environment.`
            )
          }
        }
      }

      return
    }

    if (attempt < DEFAULT_EMPTY_STATE.maxRetries) {
      await page.waitForTimeout(DEFAULT_EMPTY_STATE.retryDelayMs)
      await page.reload({ waitUntil: 'domcontentloaded', timeout: DEFAULT_EMPTY_STATE.reloadTimeoutMs })
      continue
    }

    throw new Error(
      `Could not verify empty state after ${DEFAULT_EMPTY_STATE.maxRetries} attempts. Check ${envName} environment.`
    )
  }
}

/**
 * Verify empty state for Match Schedule page.
 */
export async function verifyScheduleEmptyState(
  page: PageLike,
  schedulePage: DrawsPageLike,
  envName: EnvironmentName,
  scheduleWebsiteUrl: string = process.env.SCHEDULE_WEBSITE || ''
): Promise<void> {
  if (!scheduleWebsiteUrl) {
    throw new Error('SCHEDULE_WEBSITE is not set and scheduleWebsiteUrl was not provided')
  }

  await schedulePage.goto(scheduleWebsiteUrl)

  for (let attempt = 1; attempt <= DEFAULT_EMPTY_STATE.maxRetries; attempt++) {
    await page.waitForTimeout(DEFAULT_EMPTY_STATE.pageLoadMs)

    const errorLocator = page.locator('text=/fault.*experiencing.*problem/i')
    const hasErrorState = (await locatorCount(errorLocator)) > 0
    if (hasErrorState) {
      if (attempt < DEFAULT_EMPTY_STATE.maxRetries) {
        await page.waitForTimeout(DEFAULT_EMPTY_STATE.retryDelayMs)
        await page.reload({ waitUntil: 'domcontentloaded', timeout: DEFAULT_EMPTY_STATE.reloadTimeoutMs })
        continue
      }
      throw new Error(
        `Error state persisted after ${DEFAULT_EMPTY_STATE.maxRetries} attempts. Check ${envName} environment health.`
      )
    }

    const standardEmptyState = await locatorText(
      page.locator('h2:has-text("Match Schedule not available")').first()
    )
    const provisionalEmptyState = await locatorText(page.locator('h3:has-text("Key dates")').first())

    if (standardEmptyState || provisionalEmptyState) {
      if (schedulePage.getAllEvents && schedulePage.selectEvent) {
        const allDays = await schedulePage.getAllEvents()
        for (const rawDayName of allDays) {
          const dayName = rawDayName.trim()
          await schedulePage.selectEvent(dayName)
          await page.waitForTimeout(DEFAULT_EMPTY_STATE.dropdownUpdateMs)

          const dayStandard = await locatorText(
            page.locator('h2:has-text("Match Schedule not available")').first(),
            { timeout: DEFAULT_EMPTY_STATE.textTimeoutConfirmedMs }
          )
          const dayProvisional = await locatorText(page.locator('h3:has-text("Key dates")').first(), {
            timeout: DEFAULT_EMPTY_STATE.textTimeoutConfirmedMs,
          })

          if (!dayStandard && !dayProvisional) {
            debug(`Schedule day may have data: ${dayName}`)
          }
        }
      }
      return
    }

    if (attempt < DEFAULT_EMPTY_STATE.maxRetries) {
      await page.waitForTimeout(DEFAULT_EMPTY_STATE.retryDelayMs)
      await page.reload({ waitUntil: 'domcontentloaded', timeout: DEFAULT_EMPTY_STATE.reloadTimeoutMs })
      continue
    }

    throw new Error(
      `Could not verify Schedule empty state after ${DEFAULT_EMPTY_STATE.maxRetries} attempts. Check ${envName} environment.`
    )
  }
}

/**
 * Verify empty state for Results page.
 */
export async function verifyResultsEmptyState(
  page: PageLike,
  resultsPage: DrawsPageLike,
  envName: EnvironmentName,
  resultsWebsiteUrl: string = process.env.RESULTS_WEBSITE || ''
): Promise<void> {
  if (!resultsWebsiteUrl) {
    throw new Error('RESULTS_WEBSITE is not set and resultsWebsiteUrl was not provided')
  }

  await resultsPage.goto(resultsWebsiteUrl)

  for (let attempt = 1; attempt <= DEFAULT_EMPTY_STATE.maxRetries; attempt++) {
    await page.waitForTimeout(DEFAULT_EMPTY_STATE.pageLoadMs)

    const errorLocator = page.locator('text=/fault.*experiencing.*problem/i')
    const hasErrorState = (await locatorCount(errorLocator)) > 0
    if (hasErrorState) {
      if (attempt < DEFAULT_EMPTY_STATE.maxRetries) {
        await page.waitForTimeout(DEFAULT_EMPTY_STATE.retryDelayMs)
        await page.reload({ waitUntil: 'domcontentloaded', timeout: DEFAULT_EMPTY_STATE.reloadTimeoutMs })
        continue
      }
      throw new Error(
        `Error state persisted after ${DEFAULT_EMPTY_STATE.maxRetries} attempts. Check ${envName} environment health.`
      )
    }

    const emptyStateHeading = await locatorText(page.locator('h2:has-text("No Results")').first())
    if (emptyStateHeading) {
      if (resultsPage.getAllEvents && resultsPage.selectEvent) {
        const allDays = await resultsPage.getAllEvents()
        for (const rawDayName of allDays) {
          const dayName = rawDayName.trim()
          await resultsPage.selectEvent(dayName)
          await page.waitForTimeout(DEFAULT_EMPTY_STATE.dropdownUpdateMs)

          const dayEmpty = await locatorText(page.locator('h2:has-text("No Results")').first(), {
            timeout: DEFAULT_EMPTY_STATE.textTimeoutConfirmedMs,
          })
          if (!dayEmpty) {
            debug(`Results day may have data: ${dayName}`)
          }
        }
      }
      return
    }

    if (attempt < DEFAULT_EMPTY_STATE.maxRetries) {
      await page.waitForTimeout(DEFAULT_EMPTY_STATE.retryDelayMs)
      await page.reload({ waitUntil: 'domcontentloaded', timeout: DEFAULT_EMPTY_STATE.reloadTimeoutMs })
      continue
    }

    throw new Error(
      `Could not verify Results empty state after ${DEFAULT_EMPTY_STATE.maxRetries} attempts. Check ${envName} environment.`
    )
  }
}

/**
 * Verify empty state for Live Scores page.
 */
export async function verifyLiveScoresEmptyState(
  page: PageLike,
  liveScoresPage: DrawsPageLike,
  envName: EnvironmentName,
  liveScoresWebsiteUrl: string = process.env.LIVE_SCORES_WEBSITE || ''
): Promise<void> {
  if (!liveScoresWebsiteUrl) {
    throw new Error(
      'LIVE_SCORES_WEBSITE is not set and liveScoresWebsiteUrl was not provided'
    )
  }

  await liveScoresPage.goto(liveScoresWebsiteUrl)

  for (let attempt = 1; attempt <= DEFAULT_EMPTY_STATE.maxRetries; attempt++) {
    await page.waitForTimeout(DEFAULT_EMPTY_STATE.pageLoadMs)

    const errorLocator = page.locator('text=/fault.*experiencing.*problem/i')
    const hasErrorState = (await locatorCount(errorLocator)) > 0
    if (hasErrorState) {
      if (attempt < DEFAULT_EMPTY_STATE.maxRetries) {
        await page.waitForTimeout(DEFAULT_EMPTY_STATE.retryDelayMs)
        await page.reload({ waitUntil: 'domcontentloaded', timeout: DEFAULT_EMPTY_STATE.reloadTimeoutMs })
        continue
      }
      throw new Error(
        `Error state persisted after ${DEFAULT_EMPTY_STATE.maxRetries} attempts. Check ${envName} environment health.`
      )
    }

    const emptyStateHeading = await locatorText(
      page.locator('h2:has-text("No Live Matches")').first()
    )
    if (emptyStateHeading) {
      return
    }

    if (attempt < DEFAULT_EMPTY_STATE.maxRetries) {
      await page.waitForTimeout(DEFAULT_EMPTY_STATE.retryDelayMs)
      await page.reload({ waitUntil: 'domcontentloaded', timeout: DEFAULT_EMPTY_STATE.reloadTimeoutMs })
      continue
    }

    throw new Error(
      `Could not verify Live Scores empty state after ${DEFAULT_EMPTY_STATE.maxRetries} attempts. Check ${envName} environment.`
    )
  }
}

/**
 * Generic empty state verification helper.
 */
export async function verifyEmptyState(
  page: PageLike,
  pageUrl: string,
  emptyStateSelector: string,
  expectedPattern: RegExp,
  pageName: string,
  envName: EnvironmentName
): Promise<void> {
  if (page.goto) {
    await page.goto(pageUrl)
  } else {
    throw new Error('Page adapter does not support goto(url); use page helper with goto() first')
  }

  for (let attempt = 1; attempt <= DEFAULT_EMPTY_STATE.maxRetries; attempt++) {
    await page.waitForTimeout(DEFAULT_EMPTY_STATE.pageLoadMs)
    await page.waitForLoadState?.('networkidle', { timeout: DEFAULT_EMPTY_STATE.networkIdleTimeoutMs })

    const errorLocator = page.locator('text=/fault.*experiencing.*problem/i')
    const hasErrorState = (await locatorCount(errorLocator)) > 0
    if (hasErrorState) {
      if (attempt < DEFAULT_EMPTY_STATE.maxRetries) {
        await page.waitForTimeout(DEFAULT_EMPTY_STATE.retryDelayMs)
        await page.reload({ waitUntil: 'domcontentloaded', timeout: DEFAULT_EMPTY_STATE.reloadTimeoutMs })
        continue
      }
      throw new Error(
        `Error state persisted after ${DEFAULT_EMPTY_STATE.maxRetries} attempts while checking ${pageName}. Check ${envName} environment health.`
      )
    }

    const emptyStateText = await locatorText(page.locator(emptyStateSelector).first())
    if (emptyStateText && expectedPattern.test(emptyStateText)) {
      return
    }

    if (attempt < DEFAULT_EMPTY_STATE.maxRetries) {
      await page.waitForTimeout(DEFAULT_EMPTY_STATE.retryDelayMs)
      await page.reload({ waitUntil: 'domcontentloaded', timeout: DEFAULT_EMPTY_STATE.reloadTimeoutMs })
      continue
    }
  }

  throw new Error(
    `Could not verify ${pageName} empty state after ${DEFAULT_EMPTY_STATE.maxRetries} attempts. Check ${envName} environment.`
  )
}

/**
 * Mail.tm Helper - Ephemeral Email Service Integration
 *
 * Provides methods to create temporary email addresses, wait for OTP emails,
 * and clean up accounts after test completion.
 *
 * Security: All emails are ephemeral and auto-deleted. No PII is stored.
 */

import axios, { AxiosInstance } from 'axios'
import Debug from 'debug';

const debug = Debug('utils:MailTm');

export interface MailTmAccount {
  email: string
  password: string
  accountId: string
  token: string
}

interface MailTmDomain {
  id: string
  domain: string
}

interface HydraResponse<T> {
  'hydra:member': T[]
}

interface MailTmMessage {
  id: string
  from: { address: string; name: string }
  to: Array<{ address: string; name: string }>
  subject: string
  intro: string
  text: string
  html: string[]
  createdAt: string
}

export class MailTmHelper {
  private readonly baseUrl: string
  private readonly client: AxiosInstance

  constructor() {
    this.baseUrl = process.env.MAIL_TM_API_URL || 'https://api.mail.tm'
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    })
  }

  /**
   * Create a temporary email account on Mail.tm
   * Includes retry logic with exponential backoff for rate limiting (429 errors)
   * @param retries - Number of retry attempts (default: 3)
   * @returns MailTmAccount with email, password, accountId, and auth token
   */
  async createTemporaryEmail(retries: number = 3): Promise<MailTmAccount> {
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Add delay before retry (exponential backoff for rate limiting)
        if (attempt > 1) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000) // Max 10s
          debug(
            `Retry attempt ${attempt}/${retries} after ${delayMs}ms delay...`,
          )
          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }

        // Get available domains
        const domainsResponse = await this.client.get<
          HydraResponse<MailTmDomain> | MailTmDomain[]
        >('/domains')

        // Handle both Hydra response format and plain array
        let domains: MailTmDomain[]
        if (Array.isArray(domainsResponse.data)) {
          domains = domainsResponse.data
        } else if (
          domainsResponse.data &&
          'hydra:member' in domainsResponse.data
        ) {
          domains = domainsResponse.data['hydra:member']
        } else {
          throw new Error('Unexpected response format from Mail.tm domains API')
        }

        if (!domains || domains.length === 0) {
          throw new Error('No domains available from Mail.tm API')
        }

        // Select a random domain
        const selectedDomain =
          domains[Math.floor(Math.random() * domains.length)]

        // Generate random email address
        const randomString = Math.random().toString(36).substring(2, 10)
        const timestamp = Date.now()
        const email = `aotest${randomString}${timestamp}@${selectedDomain.domain}`
        const password = this.generateSecurePassword()

        debug(
          `Creating temporary email (attempt ${attempt}/${retries}): ${this.maskEmail(email)}`,
        )

        // Create account
        const accountResponse = await this.client.post('/accounts', {
          address: email,
          password: password,
        })

        const accountId = accountResponse.data.id

        // Get authentication token
        const tokenResponse = await this.client.post('/token', {
          address: email,
          password: password,
        })

        const token = tokenResponse.data.token

        debug(`Account created successfully: ${this.maskEmail(email)}`)

        return {
          email,
          password,
          accountId,
          token,
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status
          const message = error.response?.data?.message || error.message

          // Check if it's a rate limit error (429)
          if (status === 429 && attempt < retries) {
            debug(`Rate limited (429), will retry... (${attempt}/${retries})`)
            lastError = new Error(
              `Failed to create temporary email: ${message}`,
            )
            continue // Retry with exponential backoff
          }

          lastError = new Error(`Failed to create temporary email: ${message}`)
        } else {
          lastError = error as Error
        }

        // All error types retry until the final attempt; 429 also gets exponential backoff via the continue above.
        if (attempt === retries) {
          throw lastError
        }
      }
    }

    throw (
      lastError || new Error('Failed to create temporary email after retries')
    )
  }

  /**
   * Wait for OTP email to arrive in inbox and extract the 4-digit code
   * @param account - MailTmAccount to check for emails
   * @param timeout - Maximum time to wait in milliseconds (default: 60000)
   * @returns The 4-digit OTP code
   */
  async waitForOTP(
    account: MailTmAccount,
    timeout: number = 60000,
  ): Promise<string> {
    const startTime = Date.now()
    const pollInterval = 3000 // Check every 3 seconds
    let attempts = 0

    debug(`Waiting for OTP email (timeout: ${timeout}ms)...`)

    // Configure axios client with auth token
    const authenticatedClient = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${account.token}`,
      },
      timeout: 10000,
    })

    while (Date.now() - startTime < timeout) {
      attempts++
      try {
        // Fetch messages from inbox
        const messagesResponse = await authenticatedClient.get<{
          'hydra:member': MailTmMessage[]
        }>('/messages')
        const messages = messagesResponse.data['hydra:member']

        // Look for OTP email from Australian Open
        const otpEmail = messages.find(
          (msg) =>
            msg.from.address === 'no-reply@ausopen.com' &&
            msg.subject.includes(
              "You're one step away from creating your Australian Open account",
            ),
        )

        if (otpEmail) {
          debug(`OTP email received after ${attempts} attempts`)

          // Fetch full message content
          const messageResponse = await authenticatedClient.get<MailTmMessage>(
            `/messages/${otpEmail.id}`,
          )
          const fullMessage = messageResponse.data

          // Extract OTP from email content
          const otp = this.extractOTP(
            fullMessage.text || fullMessage.intro || '',
          )

          if (otp) {
            debug('OTP extracted successfully: [MASKED]')
            return otp
          } else {
            throw new Error(
              'OTP email received but could not extract 4-digit code',
            )
          }
        }

        // Wait before next poll
        if (Date.now() - startTime < timeout) {
          await this.delay(pollInterval)
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          throw new Error('Authentication token expired or invalid')
        }
        // Continue polling on other errors
        debug(`Poll attempt ${attempts} failed, retrying...`)
      }
    }

    // Timeout reached - provide detailed error message
    throw new Error(
      `Failed to retrieve OTP within ${timeout}ms after ${attempts} attempts. ` +
        `Possible causes: Email delivery delay, incorrect sender/subject, or OTP not sent by application.`,
    )
  }

  /**
   * Extract 4-digit OTP code from email content
   * @param emailContent - Plain text or HTML content of the email
   * @returns The 4-digit OTP code or null if not found
   */
  extractOTP(emailContent: string): string | null {
    // Prefer digits that follow explicit OTP wording to avoid years/street numbers.
    const labelledMatch = emailContent.match(
      /(?:code|otp|verification)\D{0,20}\b(\d{4})\b/i,
    )
    if (labelledMatch) {
      return labelledMatch[1]
    }

    // Try extracting from HTML if text extraction failed
    // Look for code within <code> tags or similar patterns
    const htmlCodeRegex = /<code[^>]*>(\d{4})<\/code>/i
    const htmlMatch = emailContent.match(htmlCodeRegex)

    if (htmlMatch) {
      return htmlMatch[1]
    }

    // Generic fallback: first standalone four-digit sequence that is not a calendar year.
    const genericMatch = emailContent.match(/\b(?!(?:19|20)\d{2}\b)\d{4}\b/)
    if (genericMatch) {
      return genericMatch[0]
    }

    return null
  }

  /**
   * Delete temporary email account after test completion
   * @param account - MailTmAccount to delete
   */
  async deleteTemporaryEmail(account: MailTmAccount): Promise<void> {
    try {
      debug(`Deleting temporary email: ${this.maskEmail(account.email)}`)

      await this.client.delete(`/accounts/${account.accountId}`, {
        headers: {
          Authorization: `Bearer ${account.token}`,
        },
      })

      debug(`Account deleted successfully: ${this.maskEmail(account.email)}`)
    } catch (error) {
      // Log but don't throw - cleanup should not fail tests
      debug(
        `Failed to delete account ${this.maskEmail(account.email)}:`,
        axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : error,
      )
    }
  }

  /**
   * Generate a secure password for Mail.tm account
   * @returns Random secure password
   */
  private generateSecurePassword(): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const lowercase = 'abcdefghijklmnopqrstuvwxyz'
    const numbers = '0123456789'
    const special = '!@#$%^&*'
    const all = uppercase + lowercase + numbers + special

    let password = ''
    password += uppercase[Math.floor(Math.random() * uppercase.length)]
    password += lowercase[Math.floor(Math.random() * lowercase.length)]
    password += numbers[Math.floor(Math.random() * numbers.length)]
    password += special[Math.floor(Math.random() * special.length)]

    for (let i = 4; i < 16; i++) {
      password += all[Math.floor(Math.random() * all.length)]
    }

    // Shuffle password
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('')
  }

  /**
   * Mask email address for logging (security)
   * @param email - Email address to mask
   * @returns Masked email (e.g., test****@mail.tm)
   */
  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@')
    const visibleChars = Math.min(4, localPart.length)
    return `${localPart.substring(0, visibleChars)}****@${domain}`
  }

  /**
   * Helper to delay execution
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// Export singleton instance
export const mailTmHelper = new MailTmHelper()

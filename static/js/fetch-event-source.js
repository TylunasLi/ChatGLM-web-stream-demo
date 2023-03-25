/*
    Fetch-Event-Source: Use EventSource API by wrapping `fetch`
    Copyright (C) 2021  Mauve Signweaver

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

const CONNECTING = 0
const OPEN = 1
const CLOSED = 2

const EVENT_LINE = 'event:'
const DATA_LINE = 'data:'
const ID_LINE = 'id:'
const RETRY_LINE = 'retry:'

const DEFAULT_RETRY = 5000

function createEventSource (
  fetch = globalThis.fetch,
  {
    Event = globalThis.Event,
    EventTarget = globalThis.EventTarget,
    defaultRetry = DEFAULT_RETRY
  } = {}
) {
  if (!fetch) throw new Error('Must specify `fetch` instance')

  class MessageEvent extends Event {
    constructor (data, lastEventId, eventType = 'message') {
      super(eventType)
      this.data = data
      this.lastEventId = lastEventId
    }
  }

  class CloseEvent extends Event {
    constructor () {
      super('close')
    }
  }

  class ErrorEvent extends Event {
    constructor (error) {
      super('error')
      this.error = error
    }
  }

  class OpenEvent extends Event {
    constructor () {
      super('open')
    }
  }

  class EventSource extends EventTarget {
    #readyState
    #url
    #withCredentials

    #reconnectTime = defaultRetry
    #currentRequest = null
    #currentOptions = null
    #currentReader = null
    #lastEventId = null
    #decoder = new TextDecoder()

    constructor (url, options = {}) {
      super()
      this.#currentOptions = options
      this.#withCredentials = options.withCredentials
      this.#url = url
      this.#openRequest()
    }

    get readyState () {
      return this.#readyState
    }

    get url () {
      return this.#url
    }

    get withCredentials () {
      return this.#withCredentials
    }

    close () {
      if (this.#readyState === CLOSED) return
      this.#readyState = CLOSED

      if (this.#currentReader && !this.#currentReader.closed) {
        this.#currentReader.cancel()
      }

      this.#emitClose()
    }

    async #openRequest () {
      try {
        this.#readyState = CONNECTING

        const credentials = this.#withCredentials ? 'include' : 'omit'
        let defaultOptions = {
            credentials: credentials,
            headers: {
              'Accept': 'text/event-stream',
              'Last-Event-ID': this.#lastEventId
            }
        }
        let options, header;
        if (this.#currentOptions) {
            if (this.#currentOptions.headers)
                header = Object.assign(this.#currentOptions.headers, defaultOptions.headers)
            options = Object.assign(this.#currentOptions, defaultOptions);
            if (this.#currentOptions.headers)
                options.headers = header
        } else {
            options = defaultOptions
        }
        this.#currentRequest = await fetch(this.#url, options)

        if (!this.#currentRequest.ok) {
          const error = new Error('Response not ok')
          error.response = this.#currentRequest
          throw error
        }

        const contentType = this.#currentRequest.headers.get('Content-Type')

        if (!contentType || !contentType.includes('text/event-stream')) {
          throw new Error('Invalid content type')
        }

        this.#readyState = OPEN

        this.#emitOpen()

        this.#currentReader = await this.#currentRequest.body.getReader()

        let currentBuffer = ''
        let currentEvent = 'message'
        let currentData = ''

        while (true) {
          const { done, value } = await this.#currentReader.read()

          if (done) break

          if(typeof value !== 'string') {
            currentBuffer += this.#decoder.decode(value)
          } else {
            currentBuffer += value
          }

          if (!currentBuffer.includes('\n')) continue

          const lines = currentBuffer.split('\n')

          // Get remaining data and put it into the buffer
          currentBuffer = lines.pop()

          for (const line of lines) {
            if (!line.trim()) {
              // Got an empty newline, send out the data
              if (currentEvent === 'message') {
                this.#emitMessage(currentData, this.#lastEventId)
              } else {
                this.#emitEvent(currentEvent, currentData, this.#lastEventId)
              }
              currentEvent = 'message'
              currentData = ''
            }
            if (line.startsWith(DATA_LINE)) {
              const data = line.slice(DATA_LINE.length).trimStart()
              if (currentData) currentData += '\n'
              currentData += data
            }
            if (line.startsWith(EVENT_LINE)) {
              currentEvent = line.slice(EVENT_LINE.length).trim()
            }
            if (line.startsWith(ID_LINE)) {
              this.#lastEventId = line.slice(ID_LINE.length).trimStart()
            }
            if (line.startsWith(RETRY_LINE)) {
              const retry = parseInt(line.slice(RETRY_LINE.length).trimStart(), 10)
              if (retry) this.#reconnectTime = retry
            }
          }
        }

        if (this.#readyState === CLOSED) return

        this.#readyState = CONNECTING

        // Loop
        await sleep(this.#reconnectTime)

        // May have closed after waiting
        if (this.#readyState === CLOSED) return

        this.#openRequest()
      } catch (error) {
        this.#readyState = CLOSED
        this.#emitError(error)
      }
    }

    #emitError (error) {
      const event = new ErrorEvent(error)

      this.dispatchEvent(event)

      if (typeof this.onerror === 'function') {
        this.onerror(event)
      }
    }

    #emitMessage (data, id = null) {
      const event = new MessageEvent(data, id)

      this.dispatchEvent(event)

      if (typeof this.onmessage === 'function') {
        this.onMessage(event)
      }
    }

    #emitEvent (type, data, id = null) {
      const event = new MessageEvent(data, id, type)

      this.dispatchEvent(event)
    }

    #emitClose () {
      const event = new CloseEvent()

      this.dispatchEvent(event)

      if (typeof this.onclose === 'function') {
        this.onclose(event)
      }
    }

    #emitOpen () {
      const event = new OpenEvent()

      this.dispatchEvent(event)

      if (typeof this.onopen === 'function') {
        this.onopen(event)
      }
    }
  }

  return {
    EventSource,
    Event,
    EventTarget,
    MessageEvent,
    ErrorEvent,
    CloseEvent,
    OpenEvent,
    fetch
  }
}

function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time))
}

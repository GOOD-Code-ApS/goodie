import type { InvocationContext, MethodInterceptor } from '@goodie-ts/aop';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitMetadata {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenAttempts: number;
}

interface CircuitEntry {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  failureThreshold: number;
  resetTimeout: number;
  halfOpenAttempts: number;
}

/** Error thrown when the circuit breaker is open and rejecting calls. */
export class CircuitOpenError extends Error {
  constructor(methodKey: string) {
    super(`Circuit breaker is OPEN for ${methodKey}`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * AOP interceptor implementing the circuit breaker pattern.
 *
 * State machine: CLOSED → OPEN → HALF_OPEN → CLOSED (on success) or OPEN (on failure).
 *
 * Each decorated method gets its own circuit, keyed by `className:methodName`.
 */
export class CircuitBreakerInterceptor implements MethodInterceptor {
  private readonly circuits = new Map<string, CircuitEntry>();

  intercept(ctx: InvocationContext): unknown {
    const meta = ctx.metadata as CircuitMetadata | undefined;
    if (!meta) return ctx.proceed();

    const key = `${ctx.className}:${ctx.methodName}`;
    const circuit = this.getOrCreateCircuit(key, meta);

    if (circuit.state === 'OPEN') {
      const elapsed = Date.now() - circuit.lastFailureTime;
      if (elapsed >= circuit.resetTimeout) {
        circuit.state = 'HALF_OPEN';
        circuit.successCount = 0;
      } else {
        throw new CircuitOpenError(key);
      }
    }

    try {
      const result = ctx.proceed();

      if (result instanceof Promise) {
        return result.then(
          (value) => {
            this.onSuccess(circuit);
            return value;
          },
          (error) => {
            this.onFailure(circuit);
            throw error;
          },
        );
      }

      this.onSuccess(circuit);
      return result;
    } catch (error) {
      this.onFailure(circuit);
      throw error;
    }
  }

  /** Visible for testing — get the current state of a circuit. */
  getCircuitState(className: string, methodName: string): CircuitState {
    const key = `${className}:${methodName}`;
    return this.circuits.get(key)?.state ?? 'CLOSED';
  }

  private getOrCreateCircuit(key: string, meta: CircuitMetadata): CircuitEntry {
    let circuit = this.circuits.get(key);
    if (!circuit) {
      circuit = {
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
        failureThreshold: meta.failureThreshold,
        resetTimeout: meta.resetTimeout,
        halfOpenAttempts: meta.halfOpenAttempts,
      };
      this.circuits.set(key, circuit);
    }
    return circuit;
  }

  private onSuccess(circuit: CircuitEntry): void {
    if (circuit.state === 'HALF_OPEN') {
      circuit.successCount++;
      if (circuit.successCount >= circuit.halfOpenAttempts) {
        circuit.state = 'CLOSED';
        circuit.failureCount = 0;
        circuit.successCount = 0;
      }
    } else if (circuit.state === 'CLOSED') {
      circuit.failureCount = 0;
    }
  }

  private onFailure(circuit: CircuitEntry): void {
    circuit.failureCount++;
    circuit.lastFailureTime = Date.now();

    if (circuit.state === 'HALF_OPEN') {
      circuit.state = 'OPEN';
      circuit.successCount = 0;
    } else if (
      circuit.state === 'CLOSED' &&
      circuit.failureCount >= circuit.failureThreshold
    ) {
      circuit.state = 'OPEN';
    }
  }
}

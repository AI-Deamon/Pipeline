/**
 * API Error handling utilities
 * Provides consistent error handling across the application
 */

export class ApiError extends Error {
  public status: number;
  public details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  static isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
  }

  static fromAxiosError(error: unknown): ApiError {
    if (ApiError.isApiError(error)) {
      return error;
    }

    // Axios error format
    const axiosError = error as {
      response?: {
        status?: number;
        data?: {
          detail?: string;
          message?: string;
        };
      };
      request?: unknown;
      message?: string;
    };

    const status = axiosError.response?.status || 500;
    const message =
      axiosError.response?.data?.detail ||
      axiosError.response?.data?.message ||
      axiosError.message ||
      'An unexpected error occurred';

    return new ApiError(status, message, axiosError.response?.data);
  }

  static getErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
    if (ApiError.isApiError(error)) {
      return error.message;
    }

    const axiosError = error as {
      response?: {
        data?: {
          detail?: string;
          message?: string;
        };
      };
      message?: string;
    };

    return (
      axiosError.response?.data?.detail ||
      axiosError.response?.data?.message ||
      axiosError.message ||
      fallback
    );
  }
}

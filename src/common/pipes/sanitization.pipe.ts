// common/pipes/sanitization.pipe.ts
import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

/**
 * Data Sanitization Pipe
 *
 * Sanitizes incoming data to prevent XSS attacks.
 *
 * Features:
 * - Removes HTML tags from strings
 * - Trims whitespace
 * - Normalizes special characters
 * - Applied to DTOs automatically
 *
 * Usage:
 * @UsePipes(new SanitizationPipe())
 */
@Injectable()
export class SanitizationPipe implements PipeTransform {
    transform(value: any, metadata: ArgumentMetadata): any {
        if (value === null || value === undefined) {
            return value;
        }

        // Handle objects (DTOs)
        if (typeof value === 'object' && !Array.isArray(value)) {
            return this.sanitizeObject(value);
        }

        // Handle arrays
        if (Array.isArray(value)) {
            return value.map((item) => this.transform(item, metadata));
        }

        // Handle strings
        if (typeof value === 'string') {
            return this.sanitizeString(value);
        }

        return value;
    }

    /**
     * Sanitize all string properties in an object
     */
    private sanitizeObject(obj: Record<string, any>): Record<string, any> {
        const sanitized: Record<string, any> = {};

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];

                if (typeof value === 'string') {
                    sanitized[key] = this.sanitizeString(value);
                } else if (typeof value === 'object' && value !== null) {
                    if (Array.isArray(value)) {
                        sanitized[key] = value.map((item) =>
                            typeof item === 'string' ? this.sanitizeString(item) : item
                        );
                    } else {
                        sanitized[key] = this.sanitizeObject(value);
                    }
                } else {
                    sanitized[key] = value;
                }
            }
        }

        return sanitized;
    }

    /**
     * Sanitize a string value
     */
    private sanitizeString(value: string): string {
        if (!value) return value;

        return (
            value
                // Remove HTML tags
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<[^>]+>/g, '')
                // Remove potentially dangerous characters
                .replace(/[<>]/g, '')
                // Normalize whitespace
                .trim()
                // Remove null bytes
                .replace(/\0/g, '')
        );
    }
}

import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * Validates that a string is present and not just whitespace. Stricter than
 * `@IsNotEmpty`, which accepts strings that become empty once trimmed.
 */
export function IsNotBlank(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isNotBlank',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && value.trim().length > 0;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must not be blank`;
        },
      },
    });
  };
}

import { Introspected } from '@goodie-ts/core';
import { MaxLength, NotBlank } from '@goodie-ts/validation';

@Introspected()
export class CreateTodoDto {
  @NotBlank()
  @MaxLength(255)
  title!: string;
}

@Introspected()
export class UpdateTodoDto {
  @MaxLength(255)
  title?: string;
  completed?: boolean;
}

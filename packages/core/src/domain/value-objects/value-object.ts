/**
 * Immutable value object compared by structural equality.
 */
export abstract class ValueObject<TProps extends object> {
  protected readonly props: Readonly<TProps>;

  protected constructor(props: TProps) {
    this.props = Object.freeze({ ...props });
  }

  equals(other: ValueObject<TProps> | null | undefined): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    if (this.constructor !== other.constructor) {
      return false;
    }

    return this.isEqual(this.props, other.props);
  }

  private isEqual(left: TProps, right: TProps): boolean {
    const keys = Object.keys(left) as Array<keyof TProps>;

    return keys.every((key) => Object.is(left[key], right[key]));
  }
}

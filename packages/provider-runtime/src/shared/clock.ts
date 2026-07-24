export type Clock = {
  now(): Date;
};

export class FakeClock implements Clock {
  private currentTime: Date;

  constructor(initialTime: Date = new Date('2026-07-20T08:00:00.000Z')) {
    this.currentTime = new Date(initialTime.getTime());
  }

  now(): Date {
    return new Date(this.currentTime.getTime());
  }

  advanceMs(milliseconds: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + milliseconds);
  }

  setTime(time: Date): void {
    this.currentTime = new Date(time.getTime());
  }
}

export const cloneDate = (value: Date): Date => new Date(value.getTime());

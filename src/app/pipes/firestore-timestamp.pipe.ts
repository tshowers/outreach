import { Pipe, PipeTransform } from '@angular/core';
import { formatDate } from '@angular/common';

@Pipe({
  name: 'firestoreTimestamp'
})
export class FirestoreTimestampPipe implements PipeTransform {

  transform(value: any, format: string = 'medium'): string {
    if (!value) {
      return '';
    }

    const date = this.toDate(value);
    if (!date) {
      return '';
    }

    return formatDate(date, format, 'en-US');
  }

  private toDate(value: any): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }

    if (typeof value?.toDate === 'function') {
      const converted = value.toDate();
      return converted instanceof Date && !isNaN(converted.getTime())
        ? converted
        : null;
    }

    if (typeof value?.seconds === 'number') {
      const nanoseconds = typeof value?.nanoseconds === 'number'
        ? value.nanoseconds
        : 0;
      const converted = new Date(
        (value.seconds * 1000) + Math.floor(nanoseconds / 1000000)
      );
      return isNaN(converted.getTime()) ? null : converted;
    }

    if (typeof value?._seconds === 'number') {
      const nanoseconds = typeof value?._nanoseconds === 'number'
        ? value._nanoseconds
        : 0;
      const converted = new Date(
        (value._seconds * 1000) + Math.floor(nanoseconds / 1000000)
      );
      return isNaN(converted.getTime()) ? null : converted;
    }

    const converted = new Date(value);
    return isNaN(converted.getTime()) ? null : converted;
  }
}

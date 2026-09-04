import { Pipe, PipeTransform } from '@angular/core';
import { formatDistanceToNow } from 'date-fns';

@Pipe({
  name: 'relativeTime',
  standalone: true
})
export class RelativeTimePipe implements PipeTransform {

  transform(value: Date | string): string {
    const date = typeof value === 'string' ? new Date(value) : value;
    return formatDistanceToNow(date, { addSuffix: true });
  }

}

import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AlertService {

  constructor() { }

  closeAlertAfterTimeout(elementId: string, timeout: number = 5000): void {
    setTimeout(() => {
      const alertElement = document.getElementById(elementId);
      if (alertElement) {
        alertElement.classList.remove('show');
        setTimeout(() => {
          const bootstrapAlert = new (window as any).bootstrap.Alert(alertElement);
          bootstrapAlert.close();
        }, 150); // Match Bootstrap's fade out transition duration
      }
    }, timeout);
  }

  closeAllAlertsAfterTimeout(timeout: number = 5000): void {
    setTimeout(() => {
      const alertElements = document.querySelectorAll('.alert');
      alertElements.forEach(alertElement => {
        alertElement.classList.remove('show');
        setTimeout(() => {
          const bootstrapAlert = new (window as any).bootstrap.Alert(alertElement);
          bootstrapAlert.close();
        }, 150); // Match Bootstrap's fade out transition duration
      });
    }, timeout);
  }
}

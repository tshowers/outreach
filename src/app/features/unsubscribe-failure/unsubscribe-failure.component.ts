import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { OutreachDataService } from '../../services/outreach-data.service';
import { LoggerService } from '../../services/logger.service';
import { environment } from '../../../environments/environment';

/**
 * Ported from features/email/pages/unsubscribe-failure/. Swapped the
 * monorepo's DataService ('CONTACTS'/'DELETED_CONTACTS' by endpoint key)
 * for OutreachDataService's getContactByEmail/deleteContact/addDeletedContact,
 * which hit the same `tenants/{tenantId}/contacts` and
 * `tenants/{tenantId}/deleted-contacts` collections directly.
 */
@Component( {
  selector: 'app-unsubscribe-failure',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './unsubscribe-failure.component.html',
  styleUrl: './unsubscribe-failure.component.css'
} )
export class UnsubscribeFailureComponent implements OnInit {
  email: string = '';
  statMessage: string;
  errorMessage: string | null = null;
  successMessage: string | null = null;
  tenantId: string | null = null;
  isForm: boolean = true;
  readonly COMPANY_NAME = environment.COMPANY_NAME;

  private toddStats: string[] = [
    `Did you know? ${this.COMPANY_NAME} helps businesses achieve measurable growth and streamline operations.`,
    `Stay ahead of the competition! ${this.COMPANY_NAME} users report significant time savings with our smart tools.`,
    `Maximize efficiency! Many users have seen improved workflows and reduced overhead after adopting ${this.COMPANY_NAME}.`,
    `Boost your results! ${this.COMPANY_NAME} clients often experience higher engagement and better performance.`,
    `Join thousands of professionals who rely on ${this.COMPANY_NAME} to simplify complex processes and stay organized.`
  ];

  constructor (
    private dataService: OutreachDataService,
    private route: ActivatedRoute,
    private logger: LoggerService,
  ) {
    this.statMessage = this.getRandomStat();
  }

  ngOnInit (): void {
    this.tenantId = this.route.snapshot.queryParamMap.get( 'tenantId' );
    if ( !this.tenantId ) {
      this.errorMessage = "Missing tenant ID. Cannot proceed.";
    }
  }

  private getRandomStat (): string {
    const randomIndex = Math.floor( Math.random() * this.toddStats.length );
    return this.toddStats[randomIndex];
  }

  onSubmit () {
    if ( !this.tenantId ) {
      this.errorMessage = "Cannot unsubscribe without a valid tenant ID.";
      return;
    }

    this.errorMessage = null;
    this.successMessage = null;

    this.dataService.getContactByEmail( this.tenantId, this.email ).then( ( contact ) => {
      if ( !contact ) {
        this.errorMessage = "We could not find a contact with that email address.";
        return;
      }
      this.deleteContact( contact );
    } ).catch( ( error ) => {
      this.errorMessage = "An error occurred while looking up your email address.";
      this.logger.error( "Error in getContactByEmail:", error );
    } );
  }

  private deleteContact ( contact: any ) {
    if ( !this.tenantId ) return;

    this.dataService.deleteContact( this.tenantId, contact.id ).then(
      () => {
        this.successMessage = "Removal in progress ... ";
        this.moveToDeletedContacts( contact );
        this.isForm = false;
      },
      ( error ) => {
        this.errorMessage = "An error occurred while trying to unsubscribe.";
        this.logger.error( "Error in unsubscribing:", error );
      }
    );
  }

  private moveToDeletedContacts ( contact: any ) {
    if ( contact && this.tenantId ) {
      this.dataService.addDeletedContact( this.tenantId, contact ).then( () => {
        this.successMessage = "You have been successfully unsubscribed.";
      } ).catch( error => {
        this.errorMessage = "There was an issue moving your contact to deleted contacts.";
        this.logger.error( "Error moving to deleted contacts:", error );
      } );
    }
    this.isForm = false;
  }
}

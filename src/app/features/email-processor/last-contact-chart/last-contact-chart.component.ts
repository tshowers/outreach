import { Component, Input, OnDestroy, ViewChild, ElementRef, OnChanges, SimpleChanges, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { OutreachCommunicationQueueService } from '../../../services/outreach-communication-queue.service';
import { EmailerContactLite } from '../emailer/emailer.component';

/** Ported near-verbatim from features/email/components/last-contact-chart/. */
@Component( {
  selector: 'app-last-contact-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './last-contact-chart.component.html',
  styleUrls: ['./last-contact-chart.component.css']
} )
export class LastContactChartComponent implements OnInit, OnDestroy, OnChanges {
  @Input() contacts!: EmailerContactLite[];
  @Input() userId!: string;
  @Input() processingCount: number = 25;
  @Output() cohortReady = new EventEmitter<EmailerContactLite[]>();
  isLoading: boolean = false;

  @ViewChild( 'suggestion', { static: true } ) suggestionRef!: ElementRef<HTMLDivElement>;

  suggestions: string[] = [];
  currentSuggestionIndex: number = 0;
  currentSuggestion: string = '';
  selectedContact!: any;
  contactsToPass: EmailerContactLite[] = [];
  processingContactIds: string[] = [];
  staleData: any[] = [];
  oldestDays = 0;
  averageDays = 0;
  queueReadyCount = 0;
  urgentCount = 0;
  topCohorts: { label: string; value: number; copy: string; }[] = [];
  stalenessSignal = 0;
  relationshipSignal = 0;
  readinessSignal = 0;

  private suggestionInterval: any;

  constructor ( private router: Router, private comminicationService: OutreachCommunicationQueueService ) { }

  ngOnInit (): void {

  }

  ngOnChanges ( changes: SimpleChanges ): void {
    if ( this.contacts ) {
      this.initializeLastContactData();
    }
  }

  ngOnDestroy (): void {
    clearInterval( this.suggestionInterval );
  }

  private initializeLastContactData (): void {
    const lastContactData = this.processLastContactData();
    this.staleData = lastContactData;
    this.buildCockpitState( lastContactData );

    if ( this.processingContactIds.length > 0 ) {
      this.comminicationService.setSelectedContacts( this.processingContactIds );
    }

    this.selectedContact = this.comminicationService.getNextContact();
  }

  onContact (): void {
    this.isLoading = true;
    try {
      if ( this.selectedContact ) {
        this.router.navigate( ['/contact', this.selectedContact] );
        this.advanceContactQueue();
        this.isLoading = false;
      }
    } catch ( error ) {
      this.isLoading = false;
    }
  }

  handleEmailSent ( contactId: string ) {
    this.contacts = this.contacts.filter( c => c.id !== contactId );
    this.advanceContactQueue();

    const updatedData = this.processLastContactData();
    this.staleData = updatedData;
    this.buildCockpitState( updatedData );
  }

  private advanceContactQueue (): void {
    this.comminicationService.shiftContact();
    this.selectedContact = this.comminicationService.getNextContact();
  }

  private getCompanyNameForQueue ( contact: EmailerContactLite | null | undefined ): string {
    return String(
      ( contact as any )?.company?.name ||
      ( contact as any )?.companyName ||
      ''
    ).trim();
  }

  private isEmailerEligibleContact ( contact: EmailerContactLite | null | undefined ): boolean {
    const firstName = String( ( contact as any )?.firstName || '' ).trim();
    const companyName = this.getCompanyNameForQueue( contact );
    return !!firstName && !!companyName;
  }

  processLastContactData (): any[] {
    const today = new Date();
    const safeProcessingCount = Number.isFinite( this.processingCount ) && this.processingCount > 0
      ? Math.floor( this.processingCount )
      : 25;

    const processed = this.contacts
      .filter( contact => {
        if ( contact.id === this.userId ) return false;
        if ( !this.isEmailerEligibleContact( contact ) ) return false;
        return contact.emailAddresses && contact.emailAddresses.length > 0 && !contact.emailAddresses[0].blocked;
      } )
      .map( contact => {
        let lastContactDate: Date | null = null;
        let lastUpdatedDate: Date | null = null;

        if ( ( contact as any ).lastContacted && typeof ( contact as any ).lastContacted === 'object' && 'seconds' in ( contact as any ).lastContacted ) {
          lastContactDate = new Date( ( ( contact as any ).lastContacted as { seconds: number; } ).seconds * 1000 );
        } else if ( typeof ( contact as any ).lastContacted === 'string' ) {
          lastContactDate = new Date( ( contact as any ).lastContacted );
        }

        if ( contact.lastUpdated && typeof contact.lastUpdated === 'object' && 'seconds' in ( contact.lastUpdated as any ) ) {
          lastUpdatedDate = new Date( ( contact.lastUpdated as any as { seconds: number; } ).seconds * 1000 );
        } else if ( typeof contact.lastUpdated === 'string' ) {
          lastUpdatedDate = new Date( contact.lastUpdated );
        }

        if ( !lastContactDate && !lastUpdatedDate ) {
          lastContactDate = ( contact as any ).dateAdded
            ? ( typeof ( contact as any ).dateAdded === 'object' && 'seconds' in ( contact as any ).dateAdded
              ? new Date( ( contact as any ).dateAdded.seconds * 1000 )
              : new Date( ( contact as any ).dateAdded ) )
            : new Date();
        }

        const activityDate = ( lastContactDate && lastUpdatedDate )
          ? ( lastContactDate > lastUpdatedDate ? lastContactDate : lastUpdatedDate )
          : ( lastContactDate || lastUpdatedDate || new Date() );

        const daysSinceLastContact = Math.floor( ( today.getTime() - activityDate.getTime() ) / ( 1000 * 60 * 60 * 24 ) );

        return {
          contact,
          chartEntry: {
            name: `${contact.firstName} ${contact.lastName}`.trim(),
            daysSinceLastContact,
            contactId: contact.id,
          }
        };
      } )
      .sort( ( a, b ) => b.chartEntry.daysSinceLastContact - a.chartEntry.daysSinceLastContact );

    const processingSubset = processed.slice( 0, safeProcessingCount );
    const chartSubset = processed.slice( 0, 25 );

    this.contactsToPass = processingSubset.map( item => item.contact );
    this.processingContactIds = processingSubset
      .map( item => item.chartEntry.contactId )
      .filter( ( contactId ): contactId is string => !!contactId );
    this.cohortReady.emit( this.contactsToPass );

    return chartSubset.map( item => item.chartEntry );
  }

  private buildCockpitState ( data: any[] ): void {
    const rows = Array.isArray( data ) ? data : [];
    const totalRows = rows.length || 1;
    const totalDays = rows.reduce( ( sum, row ) => sum + Number( row.daysSinceLastContact || 0 ), 0 );
    const oldest = rows.reduce(
      ( best, row ) => Number( row.daysSinceLastContact || 0 ) > Number( best.daysSinceLastContact || 0 ) ? row : best,
      { name: '', daysSinceLastContact: 0 }
    );

    this.oldestDays = Number( oldest.daysSinceLastContact || 0 );
    this.averageDays = rows.length ? Math.round( totalDays / rows.length ) : 0;
    this.queueReadyCount = this.contactsToPass.length;
    this.urgentCount = rows.filter( row => Number( row.daysSinceLastContact || 0 ) >= 30 ).length;

    this.stalenessSignal = Math.min( 100, Math.round( ( this.oldestDays / 60 ) * 100 ) );
    this.relationshipSignal = Math.min( 100, Math.round( ( this.averageDays / 45 ) * 100 ) );
    this.readinessSignal = Math.min( 100, Math.round( ( this.queueReadyCount / totalRows ) * 100 ) );

    this.topCohorts = rows.slice( 0, 4 ).map( row => ( {
      label: row.name,
      value: row.daysSinceLastContact,
      copy: `${row.daysSinceLastContact} days since last contact`
    } ) );
  }

}

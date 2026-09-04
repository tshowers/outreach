import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  getFirestore,
} from 'firebase/firestore';
import { Observable } from 'rxjs';

import { Contact } from '../models/contact.model';

/**
 * Trimmed, Firestore-direct data layer for the standalone Outreach app -
 * copied from Network's already-built/tested NetworkDataService (same
 * `tenants/{tenantId}/contacts` collection-path convention, confirmed
 * against TODD's `data.service.ts` / `endpoints.ts`), extended with the
 * two reads Outreach's own ported pages need beyond what Network already
 * had: getContactByEmail (UnsubscribeFailureComponent's manual-unsubscribe
 * lookup) and addDeletedContact (the same component's "move to deleted
 * contacts" step, mirroring DataService's `tenants/{tenantId}/deleted-contacts`
 * collection). Each method here exists because a specific ported component
 * needs it - this is not meant to be a complete recreation of DataService's
 * full surface.
 */
@Injectable( { providedIn: 'root' } )
export class OutreachDataService {
  private get firestore () {
    return getFirestore();
  }

  private contactsRef ( tenantId: string ) {
    return collection( this.firestore, `tenants/${tenantId}/contacts` );
  }

  private deletedContactsRef ( tenantId: string ) {
    return collection( this.firestore, `tenants/${tenantId}/deleted-contacts` );
  }

  /** Mirrors DataService.getCollectionDataWithLimit('CONTACTS', ...). */
  async getRecentContacts ( tenantId: string, limitTo = 5 ): Promise<Contact[]> {
    const q = query( this.contactsRef( tenantId ), orderBy( 'lastUpdated', 'desc' ), limit( limitTo ) );
    const snap = await getDocs( q );
    return snap.docs.map( ( d ) => ( { ...( d.data() as any ), id: d.id } ) as Contact );
  }

  /**
   * Mirrors DataService.addDocument('CONTACTS', ...): add, then patch the
   * new doc with its own id (TODD stores id redundantly inside the document
   * itself, not just as the Firestore doc id).
   */
  async addContact ( tenantId: string, data: Partial<Contact> ): Promise<string> {
    const ref = this.contactsRef( tenantId );
    const docRef = await addDoc( ref, data );
    await updateDoc( doc( ref, docRef.id ), { id: docRef.id } );
    return docRef.id;
  }

  /** Mirrors DataService.getContactFullByIdOnce(contactId, user). */
  async getContact ( tenantId: string, contactId: string ): Promise<Contact | null> {
    if ( !contactId ) return null;
    const snap = await getDoc( doc( this.contactsRef( tenantId ), contactId ) );
    return snap.exists() ? ( { id: snap.id, ...( snap.data() as any ) } as Contact ) : null;
  }

  /**
   * Mirrors DataService.getContactByEmail(emailAddress, tenantId) - queries
   * the same denormalized top-level `email` field the original uses (not
   * the `emailAddresses[]` array), so manual-unsubscribe lookups behave
   * identically to the monorepo version.
   */
  async getContactByEmail ( tenantId: string, emailAddress: string ): Promise<Contact | null> {
    if ( !tenantId || !emailAddress ) return null;
    const q = query( this.contactsRef( tenantId ), where( 'email', '==', emailAddress ), limit( 1 ) );
    const snap = await getDocs( q );
    return snap.empty ? null : ( { id: snap.docs[0].id, ...( snap.docs[0].data() as any ) } as Contact );
  }

  /** Mirrors DataService.getDocument('CONTACTS', ...) / getDocumentRealtime - live updates, not a one-time fetch. */
  getContactRealtime ( tenantId: string, contactId: string ): Observable<Contact | null> {
    return new Observable( ( subscriber ) => {
      const unsubscribe = onSnapshot(
        doc( this.contactsRef( tenantId ), contactId ),
        ( snap ) => subscriber.next( snap.exists() ? ( { id: snap.id, ...( snap.data() as any ) } as Contact ) : null ),
        ( error ) => subscriber.error( error ),
      );
      return unsubscribe;
    } );
  }

  /** Mirrors DataService.setDocument('CONTACTS', ...): merge, not overwrite. */
  async updateContact ( tenantId: string, contactId: string, data: Partial<Contact> ): Promise<void> {
    await setDoc( doc( this.contactsRef( tenantId ), contactId ), data, { merge: true } );
  }

  /** Mirrors DataService.deleteDocument('CONTACTS', ...). */
  async deleteContact ( tenantId: string, contactId: string ): Promise<void> {
    await deleteDoc( doc( this.contactsRef( tenantId ), contactId ) );
  }

  /**
   * Mirrors DataService.addDocument('DELETED_CONTACTS', ...) as used by
   * the original UnsubscribeFailureComponent's moveToDeletedContacts step.
   */
  async addDeletedContact ( tenantId: string, contact: Partial<Contact> & Record<string, any> ): Promise<string> {
    const docRef = await addDoc( this.deletedContactsRef( tenantId ), contact );
    return docRef.id;
  }

  /**
   * Mirrors DataService.getEmailWarmupState(userId) - the original ignores
   * its own userId parameter and resolves the tenant path from the
   * caller's own auth-derived tenantId, so this takes tenantId directly
   * rather than replicating that indirection.
   */
  async getEmailWarmupState ( tenantId: string ): Promise<any | null> {
    try {
      const snap = await getDoc( doc( this.firestore, `tenants/${tenantId}/emailWarmupState`, 'global' ) );
      return snap.exists() ? { id: snap.id, ...( snap.data() as any ) } : null;
    } catch {
      return null;
    }
  }

  /**
   * Mirrors DataService.getCollectionData('CONTACTS', ...) - the whole
   * tenant's contact collection, no pagination.
   */
  async getAllContacts ( tenantId: string ): Promise<Contact[]> {
    const snap = await getDocs( this.contactsRef( tenantId ) );
    return snap.docs.map( ( d ) => ( { ...( d.data() as any ), id: d.id } ) as Contact );
  }

  /**
   * Bulk write helper, chunked to stay under Firestore's 500-operation
   * batch limit. Carried over from Network's service even though no
   * currently-ported Outreach page calls it yet, so future contact-bulk
   * needs (e.g. campaign recipient import) don't have to reinvent it.
   */
  async uploadContacts ( tenantId: string, contacts: Partial<Contact>[] ): Promise<{ successCount: number; failureCount: number; skippedCount: number }> {
    const ref = this.contactsRef( tenantId );
    const chunkSize = 450;
    let successCount = 0;
    let failureCount = 0;

    for ( let i = 0; i < contacts.length; i += chunkSize ) {
      const chunk = contacts.slice( i, i + chunkSize );
      const batch = writeBatch( this.firestore );

      chunk.forEach( ( contact ) => {
        const docRef = doc( ref );
        batch.set( docRef, { ...contact, id: docRef.id } );
      } );

      try {
        await batch.commit();
        successCount += chunk.length;
      } catch {
        failureCount += chunk.length;
      }
    }

    return { successCount, failureCount, skippedCount: 0 };
  }
}

// insights.service.ts
import { Injectable } from '@angular/core';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { ArticleDefinition } from '../pages/insights/insights.page';

@Injectable({ providedIn: 'root' })
export class InsightsService {
  constructor(private firestore: Firestore) {}

  /** Real-time stream of all Insights articles, keyed by their document
   *  ID (the same slug used throughout the app — 'body', 'checkups',
   *  etc.), matching the shape the page previously got from its
   *  hardcoded `articles` object. Since this is a live listener, any
   *  edit made in the admin dashboard appears in the app automatically
   *  — no restart needed. */
  getArticles$(): Observable<Record<string, ArticleDefinition>> {
    return collectionData(collection(this.firestore, 'insights'), { idField: 'id' }).pipe(
      map((docs: any[]) => {
        const result: Record<string, ArticleDefinition> = {};
        for (const doc of docs) {
          const { id, ...rest } = doc;
          result[id] = rest as ArticleDefinition;
        }
        return result;
      })
    );
  }
}
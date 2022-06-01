import Promotions from "./Promotions";
import TypeGuard from "../Util/TypeGuard";
import { HttpsError } from "firebase-functions/v1/https";

namespace Notifications {
  export type Names =
    | "claimed-special"
    | "confirmed-special"
    | "user-points"
    | "check-in"
    | "invite"
    | "establishment-special"
    | "establishment-update"
    | "friendship-invite"
    | "invited-out-special"
    | "invited-out-update";

  export type PolymorphicDocument =
    | Document
    | Types.GenericNotification
    | Types.PromotionNotification
    | Types.PromotionShareNotification
    | Types.FriendInvitationNotification
    | Types.CheckInNotification;

  export interface Document {
    /**Mandatory. Indicates what type of notification this is. */
    name: Names;
    /**Mandatory. Whether to send this as a push notification. */
    sendPush: boolean;
    /**Mandatory. Whether to add this notification to the user's feed. */
    addToFeed: boolean;
    /**Title of the push notification. */
    pushTitle?: string;
    /**Body of the push notification. */
    pushBody?: string;

    /**Time notification was made. */
    dateTime?: FirebaseFirestore.Timestamp;
  }

  export interface Response extends Document {
    /** ID of the notification */
    id: string;
  }

  export namespace Types {
    export interface GenericNotification extends Document {}

    export interface CheckInNotification extends GenericNotification {

      //This will be a JSON stringified object
      nearbyEstablishments : string
    }

    export interface PromotionNotification extends GenericNotification {
      promotionId: string;
      promotionInfo: Promotions.Special.Document;
    }

    export interface FriendInvitationNotification extends GenericNotification {
      /**The userId who sent this friend invite */
      initiatorId: string;
      recipientId: string;
    }

    export interface PromotionShareNotification extends PromotionNotification {
      /**The userId who sent this promotion share request */
      sharedBy: string;
      /**A user generated message. */
      message: string;
    }
  }

  export interface DeprecatedUpdateNotification {
    alias: string;
    dateTime: string;
    description: string;
    establishmentId: string;
    name: string;
    updateId: string;
  }

  export function validateDocument(
    document: Document | Partial<Document>,
    partial: boolean = false
  ) {
    const { addToFeed, dateTime, name, sendPush } = document;

    const guard = new TypeGuard(partial);

    guard.eval(name, "string");
    guard.eval(sendPush, "boolean");
    guard.eval(addToFeed, "boolean");
    guard.eval(dateTime, "dateTime");

    if (document.sendPush) {
      const { pushBody, pushTitle } = document;

      try {
        guard.eval(pushBody, "string");
        guard.eval(pushTitle, "string");
      } catch (e: unknown) {
        throw new HttpsError(
          "invalid-argument",
          `pushBody or pushTitle is undefined while sendPush is set to true. Please define these fields.`
        );
      }
    }

    if (
      name === "establishment-special" ||
      name === "establishment-update" ||
      name === "claimed-special"
    ) {
      const {
        promotionId,
        promotionInfo,
      } = document as Types.PromotionNotification;
      guard.eval(promotionId, "string");
      if (!partial && !promotionInfo)
        throw new HttpsError(
          "invalid-argument",
          "Please define promotion Info when constructing a Promotion Notification"
        );
    } else if (
      name === "invited-out-update" ||
      name === "invited-out-special"
    ) {
      const {
        message,
        sharedBy,
        promotionId,
        promotionInfo,
      } = document as Types.PromotionShareNotification;
      guard.eval(message, "string");
      guard.eval(promotionId, "string");
      guard.eval(sharedBy, "string");
      if (!partial && !promotionInfo)
        throw new HttpsError(
          "invalid-argument",
          "Please define promotion Info when constructing a Promotion Notification"
        );
    } else if (name === "friendship-invite") {
      const {
        initiatorId,
        recipientId,
      } = document as Types.FriendInvitationNotification;
      guard.eval(initiatorId, "string");
      guard.eval(recipientId, "string");
    }
  }

  export function instanceOfPromotionNotification(object: any) {
    return "promotionId" in object;
  }

  export function instanceOfDeprecatedUpdateNotification(object: any) {
    return "establishmentId" in object;
  }

  export function removeNonStringFields(object: any) {
    const asArray = Object.entries(object);

    const filtered = asArray
      .filter(([key, value]) => typeof value === "string")
      .reduce(function (target: any, key) {
        target[key[0]] = key[1];
        return target;
      }, {});

    return filtered;
  }
}

export default Notifications;

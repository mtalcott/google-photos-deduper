interface BaseMessageType {
  app: "GooglePhotosDeduper";
  action:
    | "healthCheck"
    | "healthCheck.result"
    | "deletePhoto"
    | "deletePhoto.result"
    | "startDeletionTask"
    | "startDeletionTask.result"
    | "stopDeletionTask"
    | "launchApp"
    | "getAllMediaItems"
    | "getAllMediaItems.result";
}

export interface HealthCheckMessageType extends BaseMessageType {
  action: "healthCheck";
}

export interface HealthCheckResultMessageType extends BaseMessageType {
  action: "healthCheck.result";
  success: true;
  version: string;
}

export interface StartDeletionTaskMessageType extends BaseMessageType {
  action: "startDeletionTask";
  mediaItems: {
    id: string;
    productUrl: string;
  }[];
}

export interface StopDeletionTaskMessageType extends BaseMessageType {
  action: "stopDeletionTask";
}

export type StartDeletionTaskResultMessageType = BaseMessageType & {
  action: "startDeletionTask.result";
} & (
    | {
        success: true;
      }
    | {
        success: false;
        error: string;
      }
  );

export interface DeletePhotoMessageType extends BaseMessageType {
  action: "deletePhoto";
  mediaItemId: string;
}

export type DeletePhotoResultMessageType = BaseMessageType & {
  action: "deletePhoto.result";
  mediaItemId: string;
} & (
    | {
        success: true;
        deletedAt: Date;
        userUrl: URL;
      }
    | {
        success: false;
        error: string;
      }
  );

export interface LaunchAppMessageType extends BaseMessageType {
  action: "launchApp";
}

export interface GetAllMediaItemsMessageType extends BaseMessageType {
  action: "getAllMediaItems";
}

export type GetAllMediaItemsResultMessageType = BaseMessageType & {
  action: "getAllMediaItems.result";
} & (
    | {
        success: true;
        mediaItems: [any];
      }
    | {
        success: false;
        error: string;
      }
  );

export type MessageType =
  | HealthCheckMessageType
  | HealthCheckResultMessageType
  | StartDeletionTaskMessageType
  | StartDeletionTaskResultMessageType
  | DeletePhotoMessageType
  | DeletePhotoResultMessageType
  | LaunchAppMessageType
  | GetAllMediaItemsMessageType
  | GetAllMediaItemsResultMessageType;

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetExpires" DATETIME,
    "betaparticipant" BOOLEAN NOT NULL DEFAULT false,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" DATETIME,
    "provider" TEXT,
    "providerId" TEXT,
    "stripeCustomerId" TEXT,
    "subscriptionId" TEXT,
    "planType" TEXT,
    "planExpires" DATETIME,
    "trialEnds" DATETIME,
    "language" TEXT DEFAULT 'en',
    "lastSeenVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "familyId" TEXT,
    "caretakerId" TEXT,
    CONSTRAINT "Account_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Account_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "setupStage" INTEGER NOT NULL DEFAULT 0,
    "accountId" TEXT
);

-- CreateTable
CREATE TABLE "FamilyMember" (
    "familyId" TEXT NOT NULL,
    "caretakerId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("familyId", "caretakerId"),
    CONSTRAINT "FamilyMember_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FamilyMember_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Baby" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATETIME NOT NULL,
    "gender" TEXT,
    "inactive" BOOLEAN NOT NULL DEFAULT false,
    "feedWarningTime" TEXT NOT NULL DEFAULT '03:00',
    "diaperWarningTime" TEXT NOT NULL DEFAULT '02:00',
    "feedTimerFrom" TEXT NOT NULL DEFAULT 'start',
    "feedTimerTypes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    CONSTRAINT "Baby_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Caretaker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loginId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "inactive" BOOLEAN NOT NULL DEFAULT false,
    "securityPin" TEXT NOT NULL,
    "language" TEXT DEFAULT 'en',
    "badgeColor" TEXT,
    "lastSeenVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "accountId" TEXT,
    CONSTRAINT "Caretaker_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SleepLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "duration" INTEGER,
    "type" TEXT NOT NULL,
    "location" TEXT,
    "quality" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    CONSTRAINT "SleepLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SleepLog_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SleepLog_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitAbbr" TEXT NOT NULL,
    "unitName" TEXT NOT NULL,
    "activityTypes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FeedLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "time" DATETIME NOT NULL,
    "startTime" DATETIME,
    "endTime" DATETIME,
    "feedDuration" INTEGER,
    "pauseDuration" INTEGER,
    "type" TEXT NOT NULL,
    "amount" REAL,
    "unitAbbr" TEXT,
    "side" TEXT,
    "food" TEXT,
    "notes" TEXT,
    "hadReaction" BOOLEAN NOT NULL DEFAULT false,
    "reactionDescription" TEXT,
    "reactionCause" TEXT,
    "bottleType" TEXT,
    "breastMilkAmount" REAL,
    "sessionId" TEXT,
    "sourcePumpId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    CONSTRAINT "FeedLog_unitAbbr_fkey" FOREIGN KEY ("unitAbbr") REFERENCES "Unit" ("unitAbbr") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeedLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeedLog_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedLog_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiaperLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "time" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "condition" TEXT,
    "color" TEXT,
    "blowout" BOOLEAN NOT NULL DEFAULT false,
    "creamApplied" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    CONSTRAINT "DiaperLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DiaperLog_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiaperLog_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MoodLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "time" DATETIME NOT NULL,
    "mood" TEXT NOT NULL,
    "intensity" INTEGER DEFAULT 3,
    "duration" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    CONSTRAINT "MoodLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MoodLog_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MoodLog_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "time" DATETIME NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    CONSTRAINT "Note_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Note_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Note_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyName" TEXT NOT NULL DEFAULT 'My Family',
    "securityPin" TEXT NOT NULL DEFAULT '111222',
    "authType" TEXT,
    "defaultBottleUnit" TEXT NOT NULL DEFAULT 'OZ',
    "defaultSolidsUnit" TEXT NOT NULL DEFAULT 'TBSP',
    "defaultHeightUnit" TEXT NOT NULL DEFAULT 'IN',
    "defaultWeightUnit" TEXT NOT NULL DEFAULT 'LB',
    "defaultTempUnit" TEXT NOT NULL DEFAULT 'F',
    "activitySettings" TEXT,
    "sleepLocationSettings" TEXT,
    "bathTypeSettings" TEXT,
    "nurseryModeSettings" TEXT,
    "enableDebugTimer" BOOLEAN NOT NULL DEFAULT false,
    "enableDebugTimezone" BOOLEAN NOT NULL DEFAULT false,
    "enableBreastMilkTracking" BOOLEAN NOT NULL DEFAULT true,
    "includeSolidsInFeedTimer" BOOLEAN NOT NULL DEFAULT true,
    "photoQuotaMB" INTEGER,
    "dateFormat" TEXT NOT NULL DEFAULT 'MM/DD/YYYY',
    "timeFormat" TEXT NOT NULL DEFAULT '12h',
    "growthChartStandard" TEXT NOT NULL DEFAULT 'CDC',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "familyId" TEXT,
    CONSTRAINT "Settings_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "ageInDays" INTEGER,
    "photo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    CONSTRAINT "Milestone_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Milestone_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Milestone_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "thumbStoredName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "thumbSize" INTEGER NOT NULL,
    "takenAt" DATETIME NOT NULL,
    "caption" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    "milestoneId" TEXT,
    "familyId" TEXT,
    CONSTRAINT "Photo_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Photo_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Photo_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Photo_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PhotoLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "time" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    "familyId" TEXT,
    CONSTRAINT "PhotoLog_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PhotoLog_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PhotoLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PhotoLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "photoId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhotoLink_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PhotoFavorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "photoId" TEXT NOT NULL,
    "caretakerId" TEXT,
    "accountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhotoFavorite_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PumpLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "duration" INTEGER,
    "leftAmount" REAL,
    "rightAmount" REAL,
    "totalAmount" REAL,
    "unitAbbr" TEXT,
    "pumpAction" TEXT NOT NULL DEFAULT 'STORED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    CONSTRAINT "PumpLog_unitAbbr_fkey" FOREIGN KEY ("unitAbbr") REFERENCES "Unit" ("unitAbbr") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PumpLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PumpLog_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PumpLog_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BreastMilkAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "time" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "unitAbbr" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    CONSTRAINT "BreastMilkAdjustment_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BreastMilkAdjustment_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BreastMilkAdjustment_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "duration" INTEGER,
    "type" TEXT NOT NULL,
    "notes" TEXT,
    "activities" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    CONSTRAINT "PlayLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlayLog_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayLog_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BathLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "time" DATETIME NOT NULL,
    "bathType" TEXT,
    "soapUsed" BOOLEAN NOT NULL DEFAULT true,
    "shampooUsed" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    CONSTRAINT "BathLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BathLog_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BathLog_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    CONSTRAINT "Measurement_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Measurement_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Measurement_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    CONSTRAINT "Contact_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL,
    "location" TEXT,
    "color" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrencePattern" TEXT,
    "recurrenceEnd" DATETIME,
    "customRecurrence" TEXT,
    "reminderTime" INTEGER,
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    CONSTRAINT "CalendarEvent_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BabyEvent" (
    "babyId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    PRIMARY KEY ("babyId", "eventId"),
    CONSTRAINT "BabyEvent_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BabyEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaretakerEvent" (
    "caretakerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    PRIMARY KEY ("caretakerId", "eventId"),
    CONSTRAINT "CaretakerEvent_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CaretakerEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactEvent" (
    "contactId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    PRIMARY KEY ("contactId", "eventId"),
    CONSTRAINT "ContactEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContactEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Medicine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "typicalDoseSize" REAL,
    "unitAbbr" TEXT,
    "doseMinTime" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSupplement" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    CONSTRAINT "Medicine_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Medicine_unitAbbr_fkey" FOREIGN KEY ("unitAbbr") REFERENCES "Unit" ("unitAbbr") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MedicineLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "time" DATETIME NOT NULL,
    "doseAmount" REAL NOT NULL,
    "unitAbbr" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "medicineId" TEXT NOT NULL,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    CONSTRAINT "MedicineLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MedicineLog_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MedicineLog_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MedicineLog_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MedicineLog_unitAbbr_fkey" FOREIGN KEY ("unitAbbr") REFERENCES "Unit" ("unitAbbr") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactMedicine" (
    "contactId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,

    PRIMARY KEY ("contactId", "medicineId"),
    CONSTRAINT "ContactMedicine_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContactMedicine_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VaccineLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "time" DATETIME NOT NULL,
    "vaccineName" TEXT NOT NULL,
    "doseNumber" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    CONSTRAINT "VaccineLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VaccineLog_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VaccineLog_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VaccineDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "vaccineLogId" TEXT NOT NULL,
    CONSTRAINT "VaccineDocument_vaccineLogId_fkey" FOREIGN KEY ("vaccineLogId") REFERENCES "VaccineLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactVaccine" (
    "contactId" TEXT NOT NULL,
    "vaccineLogId" TEXT NOT NULL,

    PRIMARY KEY ("contactId", "vaccineLogId"),
    CONSTRAINT "ContactVaccine_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContactVaccine_vaccineLogId_fkey" FOREIGN KEY ("vaccineLogId") REFERENCES "VaccineLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Food" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "commonAllergen" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    CONSTRAINT "Food_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FoodLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "time" DATETIME NOT NULL,
    "amount" REAL,
    "unitAbbr" TEXT,
    "enjoyment" TEXT,
    "hadReaction" BOOLEAN NOT NULL DEFAULT false,
    "reactionDescription" TEXT,
    "notes" TEXT,
    "feedLogId" TEXT,
    "foods" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "foodId" TEXT,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    CONSTRAINT "FoodLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FoodLog_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FoodLog_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FoodLog_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BabyAllergen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "allergenType" TEXT NOT NULL DEFAULT 'FOOD',
    "reactionDescription" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "babyId" TEXT NOT NULL,
    "caretakerId" TEXT,
    CONSTRAINT "BabyAllergen_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BabyAllergen_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BabyAllergen_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FamilySetup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL,
    "familyId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FamilySetup_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Caretaker" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FamilySetup_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BetaSubscriber" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "isOptedIn" BOOLEAN NOT NULL DEFAULT true,
    "optedOutAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'coming-soon',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "GiftCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "purchaserEmail" TEXT,
    "stripeSessionId" TEXT,
    "stripePaymentId" TEXT,
    "redeemedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "redeemedByAccountId" TEXT,
    CONSTRAINT "GiftCode_redeemedByAccountId_fkey" FOREIGN KEY ("redeemedByAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShortLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tag" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShortLinkClick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceType" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "referrerDomain" TEXT,
    "country" TEXT,
    "region" TEXT,
    "visitorHash" TEXT,
    "queryString" TEXT,
    "shortLinkId" TEXT NOT NULL,
    CONSTRAINT "ShortLinkClick_shortLinkId_fkey" FOREIGN KEY ("shortLinkId") REFERENCES "ShortLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pageview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "path" TEXT NOT NULL,
    "deviceType" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "referrerDomain" TEXT,
    "country" TEXT,
    "region" TEXT,
    "visitorHash" TEXT,
    "queryString" TEXT
);

-- CreateTable
CREATE TABLE "BetaCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT,
    "type" TEXT NOT NULL DEFAULT 'NOTIFICATION',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scheduledAt" DATETIME,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "BetaCampaignEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" DATETIME,
    "openedAt" DATETIME,
    "clickedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "errorMessage" TEXT,
    "campaignId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    CONSTRAINT "BetaCampaignEmail_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BetaCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BetaCampaignEmail_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "BetaSubscriber" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminPass" TEXT NOT NULL,
    "rootDomain" TEXT NOT NULL,
    "enableHttps" BOOLEAN NOT NULL DEFAULT false,
    "adminEmail" TEXT,
    "enablePhotos" BOOLEAN NOT NULL DEFAULT false,
    "defaultPhotoQuotaMB" INTEGER NOT NULL DEFAULT 5120,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EmailConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerType" TEXT NOT NULL DEFAULT 'SENDGRID',
    "sendGridApiKey" TEXT,
    "smtp2goApiKey" TEXT,
    "serverAddress" TEXT,
    "port" INTEGER,
    "username" TEXT,
    "password" TEXT,
    "enableTls" BOOLEAN NOT NULL DEFAULT true,
    "allowSelfSignedCert" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NotificationConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "vapidPublicKey" TEXT,
    "vapidPrivateKey" TEXT,
    "vapidSubject" TEXT,
    "logRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DemoTracker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "sourceFamilyId" TEXT NOT NULL,
    "dateRangeStart" DATETIME NOT NULL,
    "dateRangeEnd" DATETIME NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" DATETIME,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "CdcWeightForAge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sex" INTEGER NOT NULL,
    "ageMonths" REAL NOT NULL,
    "l" REAL NOT NULL,
    "m" REAL NOT NULL,
    "s" REAL NOT NULL,
    "p3" REAL NOT NULL,
    "p5" REAL NOT NULL,
    "p10" REAL NOT NULL,
    "p25" REAL NOT NULL,
    "p50" REAL NOT NULL,
    "p75" REAL NOT NULL,
    "p90" REAL NOT NULL,
    "p95" REAL NOT NULL,
    "p97" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "CdcLengthForAge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sex" INTEGER NOT NULL,
    "ageMonths" REAL NOT NULL,
    "l" REAL NOT NULL,
    "m" REAL NOT NULL,
    "s" REAL NOT NULL,
    "p3" REAL NOT NULL,
    "p5" REAL NOT NULL,
    "p10" REAL NOT NULL,
    "p25" REAL NOT NULL,
    "p50" REAL NOT NULL,
    "p75" REAL NOT NULL,
    "p90" REAL NOT NULL,
    "p95" REAL NOT NULL,
    "p97" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "CdcHeadCircumferenceForAge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sex" INTEGER NOT NULL,
    "ageMonths" REAL NOT NULL,
    "l" REAL NOT NULL,
    "m" REAL NOT NULL,
    "s" REAL NOT NULL,
    "p3" REAL NOT NULL,
    "p5" REAL NOT NULL,
    "p10" REAL NOT NULL,
    "p25" REAL NOT NULL,
    "p50" REAL NOT NULL,
    "p75" REAL NOT NULL,
    "p90" REAL NOT NULL,
    "p95" REAL NOT NULL,
    "p97" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "WhoWeightForAge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sex" INTEGER NOT NULL,
    "ageMonths" REAL NOT NULL,
    "l" REAL NOT NULL,
    "m" REAL NOT NULL,
    "s" REAL NOT NULL,
    "p3" REAL NOT NULL,
    "p5" REAL NOT NULL,
    "p10" REAL NOT NULL,
    "p25" REAL NOT NULL,
    "p50" REAL NOT NULL,
    "p75" REAL NOT NULL,
    "p90" REAL NOT NULL,
    "p95" REAL NOT NULL,
    "p97" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "WhoLengthForAge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sex" INTEGER NOT NULL,
    "ageMonths" REAL NOT NULL,
    "l" REAL NOT NULL,
    "m" REAL NOT NULL,
    "s" REAL NOT NULL,
    "p3" REAL NOT NULL,
    "p5" REAL NOT NULL,
    "p10" REAL NOT NULL,
    "p25" REAL NOT NULL,
    "p50" REAL NOT NULL,
    "p75" REAL NOT NULL,
    "p90" REAL NOT NULL,
    "p95" REAL NOT NULL,
    "p97" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "WhoHeadCircumferenceForAge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sex" INTEGER NOT NULL,
    "ageMonths" REAL NOT NULL,
    "l" REAL NOT NULL,
    "m" REAL NOT NULL,
    "s" REAL NOT NULL,
    "p3" REAL NOT NULL,
    "p5" REAL NOT NULL,
    "p10" REAL NOT NULL,
    "p25" REAL NOT NULL,
    "p50" REAL NOT NULL,
    "p75" REAL NOT NULL,
    "p90" REAL NOT NULL,
    "p95" REAL NOT NULL,
    "p97" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "familyId" TEXT,
    "accountId" TEXT,
    "caretakerId" TEXT,
    "submitterName" TEXT,
    "submitterEmail" TEXT,
    "parentId" TEXT,
    CONSTRAINT "Feedback_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Feedback_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Feedback_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Feedback_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Feedback" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeedbackAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "feedbackId" TEXT NOT NULL,
    CONSTRAINT "FeedbackAttachment_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT,
    "caretakerId" TEXT,
    "familyId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "userAgent" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PushSubscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PushSubscription_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PushSubscription_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT,
    "caretakerId" TEXT,
    "familyId" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeviceToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeviceToken_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeviceToken_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT,
    "babyId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "activityTypes" TEXT,
    "timerIntervalMinutes" INTEGER,
    "lastTimerNotifiedAt" DATETIME,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "caretakerId" TEXT,
    "accountId" TEXT,
    "familyId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationPreference_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationPreference_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationPreference_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NotificationPreference_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NotificationPreference_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "activityType" TEXT,
    "babyId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "httpStatus" INTEGER,
    "payload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationLog_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActiveBreastFeed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activeSide" TEXT NOT NULL,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "leftDuration" INTEGER NOT NULL DEFAULT 0,
    "rightDuration" INTEGER NOT NULL DEFAULT 0,
    "pauseDuration" INTEGER NOT NULL DEFAULT 0,
    "pausedAt" DATETIME,
    "firstSide" TEXT,
    "currentSideStartTime" DATETIME,
    "sessionStartTime" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "babyId" TEXT NOT NULL,
    "familyId" TEXT,
    "caretakerId" TEXT,
    CONSTRAINT "ActiveBreastFeed_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActiveBreastFeed_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActiveBreastFeed_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActiveActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playType" TEXT NOT NULL,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "currentStartTime" DATETIME,
    "sessionStartTime" DATETIME NOT NULL,
    "subCategory" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "babyId" TEXT NOT NULL,
    "familyId" TEXT,
    "caretakerId" TEXT,
    CONSTRAINT "ActiveActivity_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActiveActivity_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActiveActivity_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "Caretaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "babyId" TEXT,
    "scopes" TEXT NOT NULL,
    "lastUsedAt" DATETIME,
    "expiresAt" DATETIME,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApiKey_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ApiKey_babyId_fkey" FOREIGN KEY ("babyId") REFERENCES "Baby" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExternalImportRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "sourceChildId" TEXT,
    "targetEntityType" TEXT NOT NULL,
    "targetRecordId" TEXT NOT NULL,
    "rawSource" TEXT,
    "reviewFlags" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "familyId" TEXT NOT NULL,
    CONSTRAINT "ExternalImportRecord_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_verificationToken_key" ON "Account"("verificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "Account_passwordResetToken_key" ON "Account"("passwordResetToken");

-- CreateIndex
CREATE UNIQUE INDEX "Account_familyId_key" ON "Account"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_caretakerId_key" ON "Account"("caretakerId");

-- CreateIndex
CREATE INDEX "Account_email_idx" ON "Account"("email");

-- CreateIndex
CREATE INDEX "Account_verified_idx" ON "Account"("verified");

-- CreateIndex
CREATE INDEX "Account_verificationToken_idx" ON "Account"("verificationToken");

-- CreateIndex
CREATE INDEX "Account_passwordResetToken_idx" ON "Account"("passwordResetToken");

-- CreateIndex
CREATE UNIQUE INDEX "Family_slug_key" ON "Family"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Family_accountId_key" ON "Family"("accountId");

-- CreateIndex
CREATE INDEX "FamilyMember_familyId_idx" ON "FamilyMember"("familyId");

-- CreateIndex
CREATE INDEX "FamilyMember_caretakerId_idx" ON "FamilyMember"("caretakerId");

-- CreateIndex
CREATE INDEX "Baby_birthDate_idx" ON "Baby"("birthDate");

-- CreateIndex
CREATE INDEX "Baby_deletedAt_idx" ON "Baby"("deletedAt");

-- CreateIndex
CREATE INDEX "Baby_familyId_idx" ON "Baby"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Caretaker_accountId_key" ON "Caretaker"("accountId");

-- CreateIndex
CREATE INDEX "Caretaker_deletedAt_idx" ON "Caretaker"("deletedAt");

-- CreateIndex
CREATE INDEX "Caretaker_familyId_idx" ON "Caretaker"("familyId");

-- CreateIndex
CREATE INDEX "Caretaker_accountId_idx" ON "Caretaker"("accountId");

-- CreateIndex
CREATE INDEX "SleepLog_startTime_idx" ON "SleepLog"("startTime");

-- CreateIndex
CREATE INDEX "SleepLog_endTime_idx" ON "SleepLog"("endTime");

-- CreateIndex
CREATE INDEX "SleepLog_babyId_idx" ON "SleepLog"("babyId");

-- CreateIndex
CREATE INDEX "SleepLog_caretakerId_idx" ON "SleepLog"("caretakerId");

-- CreateIndex
CREATE INDEX "SleepLog_deletedAt_idx" ON "SleepLog"("deletedAt");

-- CreateIndex
CREATE INDEX "SleepLog_familyId_idx" ON "SleepLog"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_unitAbbr_key" ON "Unit"("unitAbbr");

-- CreateIndex
CREATE INDEX "Unit_unitAbbr_idx" ON "Unit"("unitAbbr");

-- CreateIndex
CREATE UNIQUE INDEX "FeedLog_sourcePumpId_key" ON "FeedLog"("sourcePumpId");

-- CreateIndex
CREATE INDEX "FeedLog_time_idx" ON "FeedLog"("time");

-- CreateIndex
CREATE INDEX "FeedLog_startTime_idx" ON "FeedLog"("startTime");

-- CreateIndex
CREATE INDEX "FeedLog_endTime_idx" ON "FeedLog"("endTime");

-- CreateIndex
CREATE INDEX "FeedLog_babyId_idx" ON "FeedLog"("babyId");

-- CreateIndex
CREATE INDEX "FeedLog_caretakerId_idx" ON "FeedLog"("caretakerId");

-- CreateIndex
CREATE INDEX "FeedLog_unitAbbr_idx" ON "FeedLog"("unitAbbr");

-- CreateIndex
CREATE INDEX "FeedLog_deletedAt_idx" ON "FeedLog"("deletedAt");

-- CreateIndex
CREATE INDEX "FeedLog_familyId_idx" ON "FeedLog"("familyId");

-- CreateIndex
CREATE INDEX "DiaperLog_time_idx" ON "DiaperLog"("time");

-- CreateIndex
CREATE INDEX "DiaperLog_babyId_idx" ON "DiaperLog"("babyId");

-- CreateIndex
CREATE INDEX "DiaperLog_caretakerId_idx" ON "DiaperLog"("caretakerId");

-- CreateIndex
CREATE INDEX "DiaperLog_deletedAt_idx" ON "DiaperLog"("deletedAt");

-- CreateIndex
CREATE INDEX "DiaperLog_familyId_idx" ON "DiaperLog"("familyId");

-- CreateIndex
CREATE INDEX "MoodLog_time_idx" ON "MoodLog"("time");

-- CreateIndex
CREATE INDEX "MoodLog_babyId_idx" ON "MoodLog"("babyId");

-- CreateIndex
CREATE INDEX "MoodLog_caretakerId_idx" ON "MoodLog"("caretakerId");

-- CreateIndex
CREATE INDEX "MoodLog_deletedAt_idx" ON "MoodLog"("deletedAt");

-- CreateIndex
CREATE INDEX "MoodLog_familyId_idx" ON "MoodLog"("familyId");

-- CreateIndex
CREATE INDEX "Note_time_idx" ON "Note"("time");

-- CreateIndex
CREATE INDEX "Note_babyId_idx" ON "Note"("babyId");

-- CreateIndex
CREATE INDEX "Note_caretakerId_idx" ON "Note"("caretakerId");

-- CreateIndex
CREATE INDEX "Note_deletedAt_idx" ON "Note"("deletedAt");

-- CreateIndex
CREATE INDEX "Note_familyId_idx" ON "Note"("familyId");

-- CreateIndex
CREATE INDEX "Settings_familyId_idx" ON "Settings"("familyId");

-- CreateIndex
CREATE INDEX "Milestone_date_idx" ON "Milestone"("date");

-- CreateIndex
CREATE INDEX "Milestone_babyId_idx" ON "Milestone"("babyId");

-- CreateIndex
CREATE INDEX "Milestone_caretakerId_idx" ON "Milestone"("caretakerId");

-- CreateIndex
CREATE INDEX "Milestone_deletedAt_idx" ON "Milestone"("deletedAt");

-- CreateIndex
CREATE INDEX "Milestone_familyId_idx" ON "Milestone"("familyId");

-- CreateIndex
CREATE INDEX "Photo_familyId_idx" ON "Photo"("familyId");

-- CreateIndex
CREATE INDEX "Photo_babyId_idx" ON "Photo"("babyId");

-- CreateIndex
CREATE INDEX "Photo_takenAt_idx" ON "Photo"("takenAt");

-- CreateIndex
CREATE INDEX "Photo_deletedAt_idx" ON "Photo"("deletedAt");

-- CreateIndex
CREATE INDEX "Photo_milestoneId_idx" ON "Photo"("milestoneId");

-- CreateIndex
CREATE INDEX "PhotoLog_familyId_idx" ON "PhotoLog"("familyId");

-- CreateIndex
CREATE INDEX "PhotoLog_babyId_idx" ON "PhotoLog"("babyId");

-- CreateIndex
CREATE INDEX "PhotoLog_time_idx" ON "PhotoLog"("time");

-- CreateIndex
CREATE INDEX "PhotoLog_deletedAt_idx" ON "PhotoLog"("deletedAt");

-- CreateIndex
CREATE INDEX "PhotoLink_activityType_activityId_idx" ON "PhotoLink"("activityType", "activityId");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoLink_photoId_activityType_activityId_key" ON "PhotoLink"("photoId", "activityType", "activityId");

-- CreateIndex
CREATE INDEX "PhotoFavorite_photoId_idx" ON "PhotoFavorite"("photoId");

-- CreateIndex
CREATE INDEX "PhotoFavorite_caretakerId_idx" ON "PhotoFavorite"("caretakerId");

-- CreateIndex
CREATE INDEX "PhotoFavorite_accountId_idx" ON "PhotoFavorite"("accountId");

-- CreateIndex
CREATE INDEX "PumpLog_startTime_idx" ON "PumpLog"("startTime");

-- CreateIndex
CREATE INDEX "PumpLog_endTime_idx" ON "PumpLog"("endTime");

-- CreateIndex
CREATE INDEX "PumpLog_babyId_idx" ON "PumpLog"("babyId");

-- CreateIndex
CREATE INDEX "PumpLog_caretakerId_idx" ON "PumpLog"("caretakerId");

-- CreateIndex
CREATE INDEX "PumpLog_unitAbbr_idx" ON "PumpLog"("unitAbbr");

-- CreateIndex
CREATE INDEX "PumpLog_deletedAt_idx" ON "PumpLog"("deletedAt");

-- CreateIndex
CREATE INDEX "PumpLog_familyId_idx" ON "PumpLog"("familyId");

-- CreateIndex
CREATE INDEX "BreastMilkAdjustment_time_idx" ON "BreastMilkAdjustment"("time");

-- CreateIndex
CREATE INDEX "BreastMilkAdjustment_babyId_idx" ON "BreastMilkAdjustment"("babyId");

-- CreateIndex
CREATE INDEX "BreastMilkAdjustment_caretakerId_idx" ON "BreastMilkAdjustment"("caretakerId");

-- CreateIndex
CREATE INDEX "BreastMilkAdjustment_deletedAt_idx" ON "BreastMilkAdjustment"("deletedAt");

-- CreateIndex
CREATE INDEX "BreastMilkAdjustment_familyId_idx" ON "BreastMilkAdjustment"("familyId");

-- CreateIndex
CREATE INDEX "PlayLog_startTime_idx" ON "PlayLog"("startTime");

-- CreateIndex
CREATE INDEX "PlayLog_endTime_idx" ON "PlayLog"("endTime");

-- CreateIndex
CREATE INDEX "PlayLog_babyId_idx" ON "PlayLog"("babyId");

-- CreateIndex
CREATE INDEX "PlayLog_caretakerId_idx" ON "PlayLog"("caretakerId");

-- CreateIndex
CREATE INDEX "PlayLog_deletedAt_idx" ON "PlayLog"("deletedAt");

-- CreateIndex
CREATE INDEX "PlayLog_familyId_idx" ON "PlayLog"("familyId");

-- CreateIndex
CREATE INDEX "BathLog_time_idx" ON "BathLog"("time");

-- CreateIndex
CREATE INDEX "BathLog_babyId_idx" ON "BathLog"("babyId");

-- CreateIndex
CREATE INDEX "BathLog_caretakerId_idx" ON "BathLog"("caretakerId");

-- CreateIndex
CREATE INDEX "BathLog_deletedAt_idx" ON "BathLog"("deletedAt");

-- CreateIndex
CREATE INDEX "BathLog_familyId_idx" ON "BathLog"("familyId");

-- CreateIndex
CREATE INDEX "Measurement_date_idx" ON "Measurement"("date");

-- CreateIndex
CREATE INDEX "Measurement_type_idx" ON "Measurement"("type");

-- CreateIndex
CREATE INDEX "Measurement_babyId_idx" ON "Measurement"("babyId");

-- CreateIndex
CREATE INDEX "Measurement_caretakerId_idx" ON "Measurement"("caretakerId");

-- CreateIndex
CREATE INDEX "Measurement_deletedAt_idx" ON "Measurement"("deletedAt");

-- CreateIndex
CREATE INDEX "Measurement_familyId_idx" ON "Measurement"("familyId");

-- CreateIndex
CREATE INDEX "Contact_role_idx" ON "Contact"("role");

-- CreateIndex
CREATE INDEX "Contact_deletedAt_idx" ON "Contact"("deletedAt");

-- CreateIndex
CREATE INDEX "Contact_familyId_idx" ON "Contact"("familyId");

-- CreateIndex
CREATE INDEX "CalendarEvent_startTime_idx" ON "CalendarEvent"("startTime");

-- CreateIndex
CREATE INDEX "CalendarEvent_endTime_idx" ON "CalendarEvent"("endTime");

-- CreateIndex
CREATE INDEX "CalendarEvent_type_idx" ON "CalendarEvent"("type");

-- CreateIndex
CREATE INDEX "CalendarEvent_recurring_idx" ON "CalendarEvent"("recurring");

-- CreateIndex
CREATE INDEX "CalendarEvent_deletedAt_idx" ON "CalendarEvent"("deletedAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_familyId_idx" ON "CalendarEvent"("familyId");

-- CreateIndex
CREATE INDEX "BabyEvent_babyId_idx" ON "BabyEvent"("babyId");

-- CreateIndex
CREATE INDEX "BabyEvent_eventId_idx" ON "BabyEvent"("eventId");

-- CreateIndex
CREATE INDEX "CaretakerEvent_caretakerId_idx" ON "CaretakerEvent"("caretakerId");

-- CreateIndex
CREATE INDEX "CaretakerEvent_eventId_idx" ON "CaretakerEvent"("eventId");

-- CreateIndex
CREATE INDEX "ContactEvent_contactId_idx" ON "ContactEvent"("contactId");

-- CreateIndex
CREATE INDEX "ContactEvent_eventId_idx" ON "ContactEvent"("eventId");

-- CreateIndex
CREATE INDEX "Medicine_name_idx" ON "Medicine"("name");

-- CreateIndex
CREATE INDEX "Medicine_active_idx" ON "Medicine"("active");

-- CreateIndex
CREATE INDEX "Medicine_isSupplement_idx" ON "Medicine"("isSupplement");

-- CreateIndex
CREATE INDEX "Medicine_unitAbbr_idx" ON "Medicine"("unitAbbr");

-- CreateIndex
CREATE INDEX "Medicine_deletedAt_idx" ON "Medicine"("deletedAt");

-- CreateIndex
CREATE INDEX "Medicine_familyId_idx" ON "Medicine"("familyId");

-- CreateIndex
CREATE INDEX "MedicineLog_time_idx" ON "MedicineLog"("time");

-- CreateIndex
CREATE INDEX "MedicineLog_medicineId_idx" ON "MedicineLog"("medicineId");

-- CreateIndex
CREATE INDEX "MedicineLog_babyId_idx" ON "MedicineLog"("babyId");

-- CreateIndex
CREATE INDEX "MedicineLog_caretakerId_idx" ON "MedicineLog"("caretakerId");

-- CreateIndex
CREATE INDEX "MedicineLog_unitAbbr_idx" ON "MedicineLog"("unitAbbr");

-- CreateIndex
CREATE INDEX "MedicineLog_deletedAt_idx" ON "MedicineLog"("deletedAt");

-- CreateIndex
CREATE INDEX "MedicineLog_familyId_idx" ON "MedicineLog"("familyId");

-- CreateIndex
CREATE INDEX "ContactMedicine_contactId_idx" ON "ContactMedicine"("contactId");

-- CreateIndex
CREATE INDEX "ContactMedicine_medicineId_idx" ON "ContactMedicine"("medicineId");

-- CreateIndex
CREATE INDEX "VaccineLog_time_idx" ON "VaccineLog"("time");

-- CreateIndex
CREATE INDEX "VaccineLog_vaccineName_idx" ON "VaccineLog"("vaccineName");

-- CreateIndex
CREATE INDEX "VaccineLog_babyId_idx" ON "VaccineLog"("babyId");

-- CreateIndex
CREATE INDEX "VaccineLog_caretakerId_idx" ON "VaccineLog"("caretakerId");

-- CreateIndex
CREATE INDEX "VaccineLog_deletedAt_idx" ON "VaccineLog"("deletedAt");

-- CreateIndex
CREATE INDEX "VaccineLog_familyId_idx" ON "VaccineLog"("familyId");

-- CreateIndex
CREATE INDEX "VaccineDocument_vaccineLogId_idx" ON "VaccineDocument"("vaccineLogId");

-- CreateIndex
CREATE INDEX "ContactVaccine_contactId_idx" ON "ContactVaccine"("contactId");

-- CreateIndex
CREATE INDEX "ContactVaccine_vaccineLogId_idx" ON "ContactVaccine"("vaccineLogId");

-- CreateIndex
CREATE INDEX "Food_name_idx" ON "Food"("name");

-- CreateIndex
CREATE INDEX "Food_deletedAt_idx" ON "Food"("deletedAt");

-- CreateIndex
CREATE INDEX "Food_familyId_idx" ON "Food"("familyId");

-- CreateIndex
CREATE INDEX "FoodLog_time_idx" ON "FoodLog"("time");

-- CreateIndex
CREATE INDEX "FoodLog_foodId_idx" ON "FoodLog"("foodId");

-- CreateIndex
CREATE INDEX "FoodLog_babyId_idx" ON "FoodLog"("babyId");

-- CreateIndex
CREATE INDEX "FoodLog_caretakerId_idx" ON "FoodLog"("caretakerId");

-- CreateIndex
CREATE INDEX "FoodLog_deletedAt_idx" ON "FoodLog"("deletedAt");

-- CreateIndex
CREATE INDEX "FoodLog_familyId_idx" ON "FoodLog"("familyId");

-- CreateIndex
CREATE INDEX "BabyAllergen_name_idx" ON "BabyAllergen"("name");

-- CreateIndex
CREATE INDEX "BabyAllergen_babyId_idx" ON "BabyAllergen"("babyId");

-- CreateIndex
CREATE INDEX "BabyAllergen_caretakerId_idx" ON "BabyAllergen"("caretakerId");

-- CreateIndex
CREATE INDEX "BabyAllergen_deletedAt_idx" ON "BabyAllergen"("deletedAt");

-- CreateIndex
CREATE INDEX "BabyAllergen_familyId_idx" ON "BabyAllergen"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilySetup_token_key" ON "FamilySetup"("token");

-- CreateIndex
CREATE UNIQUE INDEX "FamilySetup_familyId_key" ON "FamilySetup"("familyId");

-- CreateIndex
CREATE INDEX "FamilySetup_createdBy_idx" ON "FamilySetup"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "BetaSubscriber_email_key" ON "BetaSubscriber"("email");

-- CreateIndex
CREATE INDEX "BetaSubscriber_email_idx" ON "BetaSubscriber"("email");

-- CreateIndex
CREATE INDEX "BetaSubscriber_isOptedIn_idx" ON "BetaSubscriber"("isOptedIn");

-- CreateIndex
CREATE INDEX "BetaSubscriber_source_idx" ON "BetaSubscriber"("source");

-- CreateIndex
CREATE INDEX "BetaSubscriber_createdAt_idx" ON "BetaSubscriber"("createdAt");

-- CreateIndex
CREATE INDEX "BetaSubscriber_deletedAt_idx" ON "BetaSubscriber"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCode_code_key" ON "GiftCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCode_stripeSessionId_key" ON "GiftCode"("stripeSessionId");

-- CreateIndex
CREATE INDEX "GiftCode_redeemedByAccountId_idx" ON "GiftCode"("redeemedByAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ShortLink_slug_key" ON "ShortLink"("slug");

-- CreateIndex
CREATE INDEX "ShortLink_tag_idx" ON "ShortLink"("tag");

-- CreateIndex
CREATE INDEX "ShortLinkClick_shortLinkId_timestamp_idx" ON "ShortLinkClick"("shortLinkId", "timestamp");

-- CreateIndex
CREATE INDEX "Pageview_timestamp_idx" ON "Pageview"("timestamp");

-- CreateIndex
CREATE INDEX "Pageview_path_timestamp_idx" ON "Pageview"("path", "timestamp");

-- CreateIndex
CREATE INDEX "BetaCampaign_type_idx" ON "BetaCampaign"("type");

-- CreateIndex
CREATE INDEX "BetaCampaign_isActive_idx" ON "BetaCampaign"("isActive");

-- CreateIndex
CREATE INDEX "BetaCampaign_scheduledAt_idx" ON "BetaCampaign"("scheduledAt");

-- CreateIndex
CREATE INDEX "BetaCampaign_createdAt_idx" ON "BetaCampaign"("createdAt");

-- CreateIndex
CREATE INDEX "BetaCampaign_deletedAt_idx" ON "BetaCampaign"("deletedAt");

-- CreateIndex
CREATE INDEX "BetaCampaignEmail_sentAt_idx" ON "BetaCampaignEmail"("sentAt");

-- CreateIndex
CREATE INDEX "BetaCampaignEmail_status_idx" ON "BetaCampaignEmail"("status");

-- CreateIndex
CREATE INDEX "BetaCampaignEmail_campaignId_idx" ON "BetaCampaignEmail"("campaignId");

-- CreateIndex
CREATE INDEX "BetaCampaignEmail_subscriberId_idx" ON "BetaCampaignEmail"("subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "BetaCampaignEmail_campaignId_subscriberId_key" ON "BetaCampaignEmail"("campaignId", "subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoTracker_familyId_key" ON "DemoTracker"("familyId");

-- CreateIndex
CREATE INDEX "DemoTracker_generatedAt_idx" ON "DemoTracker"("generatedAt");

-- CreateIndex
CREATE INDEX "DemoTracker_lastAccessedAt_idx" ON "DemoTracker"("lastAccessedAt");

-- CreateIndex
CREATE INDEX "CdcWeightForAge_sex_idx" ON "CdcWeightForAge"("sex");

-- CreateIndex
CREATE INDEX "CdcWeightForAge_ageMonths_idx" ON "CdcWeightForAge"("ageMonths");

-- CreateIndex
CREATE UNIQUE INDEX "CdcWeightForAge_sex_ageMonths_key" ON "CdcWeightForAge"("sex", "ageMonths");

-- CreateIndex
CREATE INDEX "CdcLengthForAge_sex_idx" ON "CdcLengthForAge"("sex");

-- CreateIndex
CREATE INDEX "CdcLengthForAge_ageMonths_idx" ON "CdcLengthForAge"("ageMonths");

-- CreateIndex
CREATE UNIQUE INDEX "CdcLengthForAge_sex_ageMonths_key" ON "CdcLengthForAge"("sex", "ageMonths");

-- CreateIndex
CREATE INDEX "CdcHeadCircumferenceForAge_sex_idx" ON "CdcHeadCircumferenceForAge"("sex");

-- CreateIndex
CREATE INDEX "CdcHeadCircumferenceForAge_ageMonths_idx" ON "CdcHeadCircumferenceForAge"("ageMonths");

-- CreateIndex
CREATE UNIQUE INDEX "CdcHeadCircumferenceForAge_sex_ageMonths_key" ON "CdcHeadCircumferenceForAge"("sex", "ageMonths");

-- CreateIndex
CREATE INDEX "WhoWeightForAge_sex_idx" ON "WhoWeightForAge"("sex");

-- CreateIndex
CREATE INDEX "WhoWeightForAge_ageMonths_idx" ON "WhoWeightForAge"("ageMonths");

-- CreateIndex
CREATE UNIQUE INDEX "WhoWeightForAge_sex_ageMonths_key" ON "WhoWeightForAge"("sex", "ageMonths");

-- CreateIndex
CREATE INDEX "WhoLengthForAge_sex_idx" ON "WhoLengthForAge"("sex");

-- CreateIndex
CREATE INDEX "WhoLengthForAge_ageMonths_idx" ON "WhoLengthForAge"("ageMonths");

-- CreateIndex
CREATE UNIQUE INDEX "WhoLengthForAge_sex_ageMonths_key" ON "WhoLengthForAge"("sex", "ageMonths");

-- CreateIndex
CREATE INDEX "WhoHeadCircumferenceForAge_sex_idx" ON "WhoHeadCircumferenceForAge"("sex");

-- CreateIndex
CREATE INDEX "WhoHeadCircumferenceForAge_ageMonths_idx" ON "WhoHeadCircumferenceForAge"("ageMonths");

-- CreateIndex
CREATE UNIQUE INDEX "WhoHeadCircumferenceForAge_sex_ageMonths_key" ON "WhoHeadCircumferenceForAge"("sex", "ageMonths");

-- CreateIndex
CREATE INDEX "Feedback_submittedAt_idx" ON "Feedback"("submittedAt");

-- CreateIndex
CREATE INDEX "Feedback_viewed_idx" ON "Feedback"("viewed");

-- CreateIndex
CREATE INDEX "Feedback_familyId_idx" ON "Feedback"("familyId");

-- CreateIndex
CREATE INDEX "Feedback_accountId_idx" ON "Feedback"("accountId");

-- CreateIndex
CREATE INDEX "Feedback_caretakerId_idx" ON "Feedback"("caretakerId");

-- CreateIndex
CREATE INDEX "Feedback_deletedAt_idx" ON "Feedback"("deletedAt");

-- CreateIndex
CREATE INDEX "Feedback_parentId_idx" ON "Feedback"("parentId");

-- CreateIndex
CREATE INDEX "FeedbackAttachment_feedbackId_idx" ON "FeedbackAttachment"("feedbackId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_accountId_idx" ON "PushSubscription"("accountId");

-- CreateIndex
CREATE INDEX "PushSubscription_caretakerId_idx" ON "PushSubscription"("caretakerId");

-- CreateIndex
CREATE INDEX "PushSubscription_familyId_idx" ON "PushSubscription"("familyId");

-- CreateIndex
CREATE INDEX "PushSubscription_endpoint_idx" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_failureCount_idx" ON "PushSubscription"("failureCount");

-- CreateIndex
CREATE INDEX "DeviceToken_accountId_idx" ON "DeviceToken"("accountId");

-- CreateIndex
CREATE INDEX "DeviceToken_caretakerId_idx" ON "DeviceToken"("caretakerId");

-- CreateIndex
CREATE INDEX "DeviceToken_familyId_idx" ON "DeviceToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_familyId_key" ON "DeviceToken"("token", "familyId");

-- CreateIndex
CREATE INDEX "NotificationPreference_subscriptionId_idx" ON "NotificationPreference"("subscriptionId");

-- CreateIndex
CREATE INDEX "NotificationPreference_babyId_idx" ON "NotificationPreference"("babyId");

-- CreateIndex
CREATE INDEX "NotificationPreference_eventType_idx" ON "NotificationPreference"("eventType");

-- CreateIndex
CREATE INDEX "NotificationPreference_enabled_idx" ON "NotificationPreference"("enabled");

-- CreateIndex
CREATE INDEX "NotificationPreference_caretakerId_idx" ON "NotificationPreference"("caretakerId");

-- CreateIndex
CREATE INDEX "NotificationPreference_accountId_idx" ON "NotificationPreference"("accountId");

-- CreateIndex
CREATE INDEX "NotificationPreference_familyId_idx" ON "NotificationPreference"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_subscriptionId_babyId_eventType_key" ON "NotificationPreference"("subscriptionId", "babyId", "eventType");

-- CreateIndex
CREATE INDEX "NotificationLog_subscriptionId_idx" ON "NotificationLog"("subscriptionId");

-- CreateIndex
CREATE INDEX "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_success_idx" ON "NotificationLog"("success");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveBreastFeed_babyId_key" ON "ActiveBreastFeed"("babyId");

-- CreateIndex
CREATE INDEX "ActiveBreastFeed_babyId_idx" ON "ActiveBreastFeed"("babyId");

-- CreateIndex
CREATE INDEX "ActiveBreastFeed_familyId_idx" ON "ActiveBreastFeed"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveActivity_babyId_key" ON "ActiveActivity"("babyId");

-- CreateIndex
CREATE INDEX "ActiveActivity_babyId_idx" ON "ActiveActivity"("babyId");

-- CreateIndex
CREATE INDEX "ActiveActivity_familyId_idx" ON "ActiveActivity"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_familyId_idx" ON "ApiKey"("familyId");

-- CreateIndex
CREATE INDEX "ApiKey_revoked_idx" ON "ApiKey"("revoked");

-- CreateIndex
CREATE INDEX "ExternalImportRecord_familyId_providerId_idx" ON "ExternalImportRecord"("familyId", "providerId");

-- CreateIndex
CREATE INDEX "ExternalImportRecord_targetEntityType_targetRecordId_idx" ON "ExternalImportRecord"("targetEntityType", "targetRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalImportRecord_familyId_providerId_sourceEntityType_sourceRecordId_key" ON "ExternalImportRecord"("familyId", "providerId", "sourceEntityType", "sourceRecordId");

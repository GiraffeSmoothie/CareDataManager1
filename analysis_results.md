# Complete Analysis: dbStorage Method Calls vs Available Storage Methods

## All dbStorage Method Calls Found in routes.ts

1. `getUserByUsername` - Line 183
2. `updateUserForcePasswordChange` - Line 208
3. `createMasterData` - Line 628, 1252
4. `logUserActivity` - Line 638, 714, 821, 1012, 1143, 1383, 2151, 2341, 2447, 2586, 2685
5. `createServiceCaseNote` - Line 704
6. `getAllMasterData` - Line 765
7. `getMasterDataById` - Line 795, 846, 945
8. `updateMasterData` - Line 808
9. `getClientServicesReferencingMasterData` - Line 849
10. `checkMasterDataExists` - Line 903, 1912
11. `createPersonInfo` - Line 1002
12. `getAllPersonInfo` - Line 1052
13. `getPersonInfoById` - Line 1081, 1116, 1229, 1300
14. `updatePersonInfo` - Line 1127
15. `updateClientServiceStatus` - Line 1182, 2002
16. `getDocumentByClientAndFilename` - Line 1306
17. `createDocument` - Line 1365
18. `getDocumentsByClientId` - Line 1429
19. `getDocumentByFilePath` - Line 1516, 1638, 1760
20. `getClientServices` - Line 1873
21. `createClientService` - Line 1932
22. `getClientServicesByClientId` - Line 1970
23. `getServiceCaseNotesByServiceId` - Line 2030
24. `getServiceCaseNotesCount` - Line 2067
25. `getUserById` - Line 2128, 2185, 2229, 2245, 2291, 2307, 2397, 2515, 2659, 2972
26. `verifyPassword` - Line 2134
27. `updateUserPassword` - Line 2140
28. `getAllUsers` - Line 2193
29. `updateUser` - Line 2327
30. `getUserByUsername` - Line 2419 (duplicate)
31. `getAllCompanies` - Line 2520
32. `createCompany` - Line 2578
33. `getCompanyById` - Line 2667, 2734
34. `updateCompany` - Line 2676
35. `deleteCompany` - Line 2739
36. `getAllSegmentsByCompany` - Line 2792, 2988
37. `createSegment` - Line 2847
38. `updateSegment` - Line 2911
39. `deleteSegment` - Line 2944

## All Available Methods in storage.ts

1. `withTransaction`
2. `getAllUsers` ✅
3. `getUserByUsername` ✅
4. `getUserById` ✅
5. `verifyPassword` ✅
6. `updateUserPassword` ✅
7. `resetAdminPassword`
8. `updateUserForcePasswordChange` ✅
9. `createUser`
10. `updateUser` ✅
11. `deleteUser`
12. `createPersonInfo` ✅
13. `getAllPersonInfo` ✅
14. `getPersonInfoById` ✅
15. `updatePersonInfo` ✅
16. `checkDuplicateService`
17. `createMasterData` ✅
18. `getAllMasterData` ✅
19. `getMasterDataById` ✅
20. `updateMasterDataStatus`
21. `checkMasterDataExists` ✅
22. `updateMasterData` ✅
23. `getDocumentsByClientId` ✅
24. `createDocument` ✅
25. `getDocumentByFilename`
26. `getDocumentByFilePath` ✅
27. `getDocumentByClientAndFilename` ✅
28. `getClientServicesByClientId` ✅
29. `getClientServicesReferencingMasterData` ✅
30. `logUserActivity` ✅
31. `logError`
32. `logLogin`
33. `logPerformance`
34. `getAuditLogs`
35. `getAllSegmentsByCompany` ✅
36. `getSegmentById`
37. `createServiceCaseNote` ✅
38. `getServiceCaseNotesByServiceId` ✅
39. `getAllCompanies` ✅
40. `createCompany` ✅
41. `getCompanyById` ✅
42. `updateCompany` ✅
43. `createSegment` ✅
44. `updateSegment` ✅
45. `updateClientServiceStatus` ✅
46. `getClientServices` ✅
47. `createClientService` ✅
48. `getServiceCaseNotesCount` ✅

## MISSING METHODS IN storage.ts

❌ **`deleteCompany`** - Called on line 2739
❌ **`deleteSegment`** - Called on line 2944

## Summary

**RESULT: 2 Missing Storage Methods Found**

The analysis reveals that 2 storage methods are referenced in `routes.ts` but are missing from `storage.ts`:

1. **`deleteCompany`** - Used in the company deletion endpoint (line 2739)
2. **`deleteSegment`** - Used in the segment deletion endpoint (line 2944)

All other 47 unique dbStorage method calls in routes.ts have corresponding implementations in storage.ts.

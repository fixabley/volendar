# 개인정보처리방침 (Privacy Policy)

시행일: 2026-11-11

Volendar(이하 "확장")는 1365 자원봉사포털과 VMS(사회복지자원봉사인증관리)의 봉사 일정을 한 달력에서 보여주는 개인 프로젝트입니다. 행정안전부, 1365 자원봉사포털, 한국사회복지협의회(VMS)와 관계가 없습니다.

## 1. 확장이 읽는 정보

- **1365·VMS 신청내역**: 사용자가 브라우저에서 이미 로그인해 둔 세션으로 마이페이지의 신청 목록을 읽습니다. 봉사 제목, 날짜, 시간, 신청 상태, 공고 번호가 여기에 해당합니다.
- **1365 신청 가능 날짜**: 사용자가 상세 패널의 버튼을 누를 때만 1365 신청서 화면을 열어 날짜별 모집 상태를 읽습니다. 이 화면에는 사이트가 미리 채워 둔 연락처가 함께 들어 있지만, 확장은 그 값을 읽어서 쓰거나 저장하지 않습니다. 신청서는 제출하지 않습니다.
- **모집 공고**: 1365·VMS의 공개 검색 결과와 공고 상세를 읽습니다. 공고 상세의 활동 내용과 담당 기관 연락처(전화번호, 이메일, VMS는 담당자 이름 포함)도 화면에 보여주고, 사용자가 내보내기를 누르면 ICS 일정 설명과 연락처 파일(.vcf)에 넣습니다.
- **사용자가 넣은 캘린더**: 사용자가 등록한 ICS 주소(Google·iCloud·Outlook)나 직접 고른 .ics 파일에서 일정 시간과 제목을 읽습니다.

확장은 아이디, 비밀번호, 인증서 같은 로그인 정보를 묻거나 읽거나 저장하지 않습니다.

## 2. 이용 목적

읽은 정보는 다음 용도로만 사용자의 브라우저 안에서 처리합니다.

- 달력 표시
- 빈 시간 계산과 봉사시간 합계
- 사용자가 요청할 때 .ics 파일과 연락처 파일(.vcf) 생성

## 3. 저장

`chrome.storage.local`(사용자 기기)에 다음만 저장합니다.

- 필터와 화면 설정
- 사용자가 등록한 캘린더 ICS 주소
- 사용자가 불러온 .ics 파일의 일정 시간 정보(제목 제외)

신청내역, 검색 결과, 공고 상세는 저장하지 않으며, 달력 탭을 닫으면 사라집니다.

## 4. 전송과 제3자 제공

확장은 다음 주소로만 요청을 보냅니다.

- `www.1365.go.kr`, `www.vms.or.kr`: 사용자 본인의 정보를 조회하기 위한 요청
- 사용자가 등록한 캘린더 주소

개발자나 다른 제3자에게 어떤 정보도 보내지 않습니다. 분석 도구와 광고가 없고, 정보를 판매하거나 다른 목적으로 쓰지 않습니다.

## 5. 삭제

- 등록한 캘린더 주소와 불러온 파일은 확장 화면의 '삭제'·'지우기' 버튼으로 지울 수 있습니다.
- 확장을 제거하면 저장된 정보가 모두 지워집니다.

## 6. 문의와 변경

문의는 https://github.com/fixabley/volendar/issues 에 남겨 주세요. 이 방침이 바뀌면 이 문서를 고치고 시행일을 갱신합니다.

---

## English summary

Volendar is an unofficial personal project, not affiliated with the 1365 Volunteer Portal, the Ministry of the Interior and Safety, or VMS.

- **What it reads**
  - Using the session the user is already logged in with, it reads the user's volunteer applications on www.1365.go.kr and www.vms.or.kr.
  - It reads public recruitment listings and details on both sites, including activity descriptions and the posted contact (phone, email, and on VMS the staff name). These are shown in the app and, when the user exports, added to ICS descriptions and a contacts file (.vcf).
  - Only when the user clicks a button, it opens one 1365 application form to read per-day availability, without submitting it.
  - It reads calendars the user adds, either as Google, iCloud or Outlook ICS URLs or as .ics files.
- **What it never handles**: it never asks for, reads or stores passwords or other credentials.
- **Where data stays**
  - Data is processed only in the user's browser.
  - Only settings, registered calendar URLs and the times of imported calendar events (without titles) are kept in `chrome.storage.local`.
  - Application lists and search results are not stored.
- **Sharing**
  - Nothing is sent to the developer or any third party.
  - There is no analytics or advertising, and no data is sold or used for unrelated purposes.
- **Deletion**: uninstalling the extension removes all stored data.
- **Contact**: https://github.com/fixabley/volendar/issues

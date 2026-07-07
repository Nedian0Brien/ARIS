# ui.css Refactor Visual QA

- dev proxy URL: https://lawdigest.cloud/proxy/2234/
- raw dev URL checked by Playwright: http://127.0.0.1:2234
- checked at: 2026-07-07
- login: API cookie login succeeded
- navigation: visible sidebar or bottom-nav user-flow clicks were used for Project and Files; active project chat uses the current API project/chat id route.

## Results

- home 390x844: home-390.png {"activeNav":"Home","title":"Homeworkspace overview","classes":{"hasProjectList":false,"hasFiles":false,"hasProjectChat":false},"rootScrollWidth":390,"viewportWidth":390,"rootOverflow":0,"visualViewportScale":1,"offenders":[{"tag":"div","className":"m-body m-body--home","overflow":80,"clientWidth":390,"scrollWidth":470}]}
- project 390x844: project-390.png {"activeNav":"Project","title":"AARISubuntu","classes":{"hasProjectList":false,"hasFiles":false,"hasProjectChat":true},"rootScrollWidth":390,"viewportWidth":390,"rootOverflow":0,"visualViewportScale":1,"offenders":[{"tag":"div","className":"cmp__top","overflow":46,"clientWidth":376,"scrollWidth":422}]}
- files 390x844: files-390.png {"activeNav":"Files","title":"Filesproject filesystem","classes":{"hasProjectList":false,"hasFiles":true,"hasProjectChat":false},"rootScrollWidth":390,"viewportWidth":390,"rootOverflow":0,"visualViewportScale":1,"offenders":[]}
- project-chat 390x844: project-chat-390.png {"activeNav":"Project","title":"AARISubuntu","classes":{"hasProjectList":false,"hasFiles":false,"hasProjectChat":true},"rootScrollWidth":390,"viewportWidth":390,"rootOverflow":0,"visualViewportScale":1,"offenders":[{"tag":"div","className":"cmp__top","overflow":46,"clientWidth":376,"scrollWidth":422}]}
- home 768x900: home-768.png {"activeNav":"Home","title":"Homeworkspace overview","classes":{"hasProjectList":false,"hasFiles":false,"hasProjectChat":false},"rootScrollWidth":768,"viewportWidth":768,"rootOverflow":0,"visualViewportScale":1,"offenders":[{"tag":"div","className":"m-body m-body--home","overflow":80,"clientWidth":528,"scrollWidth":608}]}
- project 768x900: project-768.png {"activeNav":"Project","title":"Projects0 active · project chats in sidebar","classes":{"hasProjectList":true,"hasFiles":false,"hasProjectChat":false},"rootScrollWidth":768,"viewportWidth":768,"rootOverflow":0,"visualViewportScale":1,"offenders":[]}
- files 768x900: files-768.png {"activeNav":"Files","title":"Filesproject filesystem","classes":{"hasProjectList":false,"hasFiles":true,"hasProjectChat":false},"rootScrollWidth":768,"viewportWidth":768,"rootOverflow":0,"visualViewportScale":1,"offenders":[]}
- project-chat 768x900: project-chat-768.png {"activeNav":"Project","title":"Projects0 active · project chats in sidebar","classes":{"hasProjectList":false,"hasFiles":false,"hasProjectChat":false},"rootScrollWidth":768,"viewportWidth":768,"rootOverflow":0,"visualViewportScale":1,"offenders":[]}
- home 1280x900: home-1280.png {"activeNav":"Home","title":"Homeworkspace overview","classes":{"hasProjectList":false,"hasFiles":false,"hasProjectChat":false},"rootScrollWidth":1280,"viewportWidth":1280,"rootOverflow":0,"visualViewportScale":1,"offenders":[{"tag":"div","className":"m-body m-body--home","overflow":80,"clientWidth":1040,"scrollWidth":1120}]}
- project 1280x900: project-1280.png {"activeNav":"Project","title":"Projects0 active · project chats in sidebar","classes":{"hasProjectList":true,"hasFiles":false,"hasProjectChat":false},"rootScrollWidth":1280,"viewportWidth":1280,"rootOverflow":0,"visualViewportScale":1,"offenders":[]}
- files 1280x900: files-1280.png {"activeNav":"Files","title":"Filesproject filesystem","classes":{"hasProjectList":false,"hasFiles":true,"hasProjectChat":false},"rootScrollWidth":1280,"viewportWidth":1280,"rootOverflow":0,"visualViewportScale":1,"offenders":[]}
- project-chat 1280x900: project-chat-1280.png {"activeNav":"Project","title":"Projects0 active · project chats in sidebar","classes":{"hasProjectList":false,"hasFiles":false,"hasProjectChat":false},"rootScrollWidth":1280,"viewportWidth":1280,"rootOverflow":0,"visualViewportScale":1,"offenders":[]}
- project-chat-active 390x844: project-chat-active-390.png {"title":"AARISARIS","hasPcProto":true,"hasComposer":true,"hasTimeline":true,"rootScrollWidth":390,"viewportWidth":390,"rootOverflow":0,"visualViewportScale":1}
- project-chat-active 768x900: project-chat-active-768.png {"title":"AARISARIS","hasPcProto":true,"hasComposer":true,"hasTimeline":true,"rootScrollWidth":768,"viewportWidth":768,"rootOverflow":0,"visualViewportScale":1}
- project-chat-active 1280x900: project-chat-active-1280.png {"title":"AARISARIS","hasPcProto":true,"hasComposer":true,"hasTimeline":true,"rootScrollWidth":1280,"viewportWidth":1280,"rootOverflow":0,"visualViewportScale":1}

## Anti-Slop Preflight

- CSS selector content was preserved from the original `ui.css` split, except file-boundary whitespace.
- No new tokens, raw colors, layout shell, or user-facing copy were introduced.
- Screenshots cover 390px, 768px, and 1280px for home/project/files and active project chat.

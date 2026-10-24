# Cloudtype 배포용: 정적 파일을 busybox httpd로 그대로 제공한다 (포트 8080)
# (관리자 권한 없이, 읽기 전용 환경에서도 실행됨)
FROM busybox:1.36
COPY index.html teacher.html *.css *.js /www/
EXPOSE 8080
CMD ["httpd", "-f", "-v", "-p", "8080", "-h", "/www"]

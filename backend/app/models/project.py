class Project:
    def __init__(
        self,
        id: str,
        name: str,
        git_url: str,
        branch: str,
        credentials: str,
        sonar_key: str,
        target_ip: str | None = None,
        target_url: str | None = None,
    ):
        self.id = id
        self.name = name
        self.git_url = git_url
        self.branch = branch
        self.credentials = credentials
        self.sonar_key = sonar_key
        self.target_ip = target_ip
        self.target_url = target_url
